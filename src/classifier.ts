import config from "config";
import { filter as _filter, get } from "lodash";
import { MorningstarAPI } from "./morningstar-api";
import { PPSecurity } from "./types";
import { XMLHandler } from "./xml-helper";

interface StockConfig {
  /** Morningstar SAL API endpoint */
  salEndpoint?: "stock/equityOverview" | "stock/companyProfile";
  viewId?: string;
  sourcePath?: string;
  isSingleValue?: boolean;
  value?: string | string[]; // For static values
  mapping?: Record<string, string | string[]> | string;
}

interface TaxonomyConfig {
  // General config

  /** is taxonomy active? */
  active: boolean;
  /** Display name */
  name: string;
  /** Morningstar API viewId if not default */
  viewId?: string;

  // Fund config

  /** Data container in JSON response */
  sourcePath: string;
  /** Filter to apply to data, defaults to no filter */
  filter?: Record<string, any>;
  /** Multi/single container, defaults to single */
  multigroup?: boolean;
  /** Category field name */
  keyField: string;
  /** Value field name */
  valueField: string;
  /** Key mapping dictionary */
  mapping: Record<string, string | string[]> | string;
  /** Adjust total to 100% */
  fixTotal?: false | number;

  // Stock config
  stockConfig?: StockConfig;
}

type Assignment = { path: string[]; weight: number };

export class Classifier {
  private xmlHandler: XMLHandler;
  private api: MorningstarAPI;
  private taxonomiesConfig: Record<string, TaxonomyConfig>;
  private globalMappings: Record<string, Record<string, string | string[]>>;

  constructor(xmlHandler: XMLHandler, api: MorningstarAPI) {
    this.xmlHandler = xmlHandler;
    this.api = api;
    this.taxonomiesConfig = config.get("taxonomies");
    this.globalMappings = config.has("mappings") ? config.get("mappings") : {};
  }

  private getMapping(
    mappingOrKey: Record<string, string | string[]> | string | undefined,
  ): Record<string, string | string[]> {
    if (!mappingOrKey) return {};
    if (typeof mappingOrKey === "string") {
      if (this.globalMappings[mappingOrKey]) {
        return this.globalMappings[mappingOrKey];
      }
      console.warn(`    [Config] Mapping key '${mappingOrKey}' not found in global mappings.`);
      return {};
    }
    return mappingOrKey;
  }

  public async classifySecurity(security: PPSecurity): Promise<void> {
    if (!security.isin && !security.isinOverride) return;
    if (security.ignoreTaxonomies === true) return;

    const securityInfo = await this.api.getSecurityData(security.isinOverride || security.isin!);
    if (!securityInfo) {
      console.log(`  > No data found for ${security.name}.`);
      return;
    }

    console.log(`  > Data retrieved for ${security.name}. Type: ${securityInfo.type}. Processing taxonomies...`);

    if (securityInfo.type === "Stock") {
      await this.classifyStock(security, securityInfo.secid, securityInfo.data);
    } else if (securityInfo.type === "Fund") {
      await this.classifyFund(security, securityInfo.data);
    } else {
      console.error(`  > Unknown security type: ${securityInfo.type}! Skipping...`);
    }
  }

  private async classifyFund(security: PPSecurity, data: any): Promise<void> {
    for (const [taxonomyId, taxConfig] of Object.entries(this.taxonomiesConfig)) {
      if (!taxConfig.active) continue;
      if (
        security.ignoreTaxonomies !== undefined &&
        (security.ignoreTaxonomies === true || (security.ignoreTaxonomies as string[]).includes(taxonomyId))
      )
        continue;
      console.log(`    > ${taxonomyId}`);

      // 0. Fetch additional data if needed
      if (taxConfig.viewId) {
        const additionalData = await this.api.getSecurityData(
          security.isinOverride || security.isin!,
          taxConfig.viewId,
        );
        if (additionalData) {
          Object.assign(data, additionalData.data);
        }
      }

      // 1. Extract Data
      const sourceData = get(data, taxConfig.sourcePath);
      if (!sourceData) {
        console.warn(`    [${taxonomyId}] No data found at path '${taxConfig.sourcePath}'`);
        continue;
      }
      if (!Array.isArray(sourceData)) {
        console.warn(`    [${taxonomyId}] Data at '${taxConfig.sourcePath}' is not an array.`);
        continue;
      }

      // 2. Filter Data
      // console.log(`    [${taxonomyId}] Filtering ${sourceData.length} items...`);
      let filteredData = sourceData;
      if (taxConfig.filter) {
        filteredData = _filter(sourceData, taxConfig.filter);
      }
      if (filteredData.length === 0) {
        console.log(`    [${taxonomyId}] No items match the filter.`);
        continue;
      }

      if (!taxConfig.multigroup && filteredData.length > 1) filteredData = [filteredData[0]];
      // console.debug(sourceData, filteredData);

      // 2.1 Extract BreakdownValues (Flattening)
      // The data we want is usually nested in a 'BreakdownValues' array inside the filtered items
      const itemsToProcess: any[] = [];
      for (const group of filteredData) {
        if (group.BreakdownValues && Array.isArray(group.BreakdownValues)) {
          itemsToProcess.push(...group.BreakdownValues);
        } else {
          itemsToProcess.push(group);
        }
      }

      // 3. Map and Assign
      // console.log(`    [${taxonomyId}] Assigning ${itemsToProcess.length} items...`);
      let assignments: Assignment[] = [];
      assignments = this.assignItems(taxConfig, itemsToProcess, assignments, taxonomyId);

      // 4. Truncate breakdown to ensure total is not above 100%
      if (taxConfig.fixTotal) assignments = this.fixTotalPercentage(assignments, taxonomyId);

      /*
      const deviation = totalWeight - 100_00;
      if (taxConfig.fixTotal && deviation !== 0 && assignments.length > 0) {
        // Condition: Deviation is within the acceptable range
        const maxAllowedDeviation = taxConfig.fixTotal;

        if (!hasNegativeWeights && Math.abs(deviation) <= maxAllowedDeviation) {
          console.log(
            `    [${taxonomyId}] Adjusting total weight from ${totalWeight / 100}% to 100%. Deviation: ${
              deviation / 100
            }% for a max of ${maxAllowedDeviation / 100}, applying ${deviation / 100}% correction`,
          );

          // Sort by weight descending to apply correction to largest items first
          assignments.sort((a, b) => b.weight - a.weight);

          let correctionToApply = -deviation; // We want to add this amount to reach 10000

          // Distribute the correction (as units of 1, i.e., 0.01%)
          for (let i = 0; i < Math.abs(correctionToApply); i++) {
            const index = i % assignments.length;
            assignments[index].weight += Math.sign(correctionToApply);
          }
        } else if (deviation !== 0) {
          // Only log if there's a deviation we're not correcting
          console.warn(
            `    [${taxonomyId}] Total weight is ${
              totalWeight / 100
            }%. Deviation of ${deviation} is too large (max allowed: ${
              maxAllowedDeviation
            }) or negative values exist. Skipping correction.`,
          );
        }
      }
        */

      // 5. Update the XML
      this.xmlHandler.updateSecurityAssignments(taxConfig.name || taxonomyId, security.uuid, assignments);
    }
  }

  private assignItems(taxConfig: TaxonomyConfig, itemsToProcess: any[], assignments: Assignment[], taxonomyId: string) {
    const mapping = this.getMapping(taxConfig.mapping);
    for (const item of itemsToProcess) {
      const key = item[taxConfig.keyField];
      const value = item[taxConfig.valueField];
      const weight = Math.round(parseFloat(value) * 100);

      if (key) {
        if (!Object.keys(mapping).length) {
          assignments.push({ path: [key], weight });
        } else if (key in mapping) {
          const targetClass = mapping[key];
          if (targetClass) {
            const path = Array.isArray(targetClass) ? targetClass : [targetClass];
            if (weight > 0) {
              assignments.push({ path, weight });
              // console.debug(
              //   `    [${taxonomyId}] Mapping key '${key}' to '${path.join(" > ")}' with value of ${weight} (${value}%)`,
              // );
            } else {
              console.warn(
                `    [${taxonomyId}] Negative or null weight for key: '${key}' ignored (Value: ${weight / 100})`,
              );
            }
          }
        } else {
          console.warn(`    [${taxonomyId}] Unmapped key: '${key}' (Value: ${weight / 100})`);
        }
      } else {
        console.error(`    [${taxonomyId}] No key!!! (Value: ${weight / 100})`);
      }
    }
    return assignments;
  }

  private fixTotalPercentage(assignments: Assignment[], taxonomyId: string): Assignment[] {
    const totalWeight = assignments.reduce((sum, assignment) => sum + assignment.weight, 0);
    if (totalWeight > 10000) {
      assignments.sort((a, b) => b.weight - a.weight);
      let totalWeight = 0;
      for (let i = 0; i < assignments.length; i++) {
        if (totalWeight + assignments[i].weight > 10000) {
          assignments[i].weight = 10000 - totalWeight;
          console.log(
            `    [${taxonomyId}] Truncating weight for '${assignments[i].path.join(" > ")}' to ${assignments[i].weight / 100}%`,
          );
          if (assignments[i].weight == 0) delete assignments[i];
          totalWeight = 10000;
        } else totalWeight += assignments[i].weight;
      }
    }
    return assignments.filter((a) => a && a.weight > 0);
  }

  private async classifyStock(security: PPSecurity, secid: string | null, data: any): Promise<void> {
    if (!secid && !data) {
      console.warn(`  > Cannot classify stock ${security.name} without data.`);
      return;
    }

    for (const [taxonomyId, taxConfig] of Object.entries(this.taxonomiesConfig)) {
      if (!taxConfig.active) continue;
      if (
        security.ignoreTaxonomies !== undefined &&
        (security.ignoreTaxonomies === true || (security.ignoreTaxonomies as string[]).includes(taxonomyId))
      )
        continue;
      if (!taxConfig.stockConfig) continue;
      console.log(`    > ${taxonomyId}`);

      const stockConfig = taxConfig.stockConfig;

      if (stockConfig.isSingleValue && stockConfig.value) {
        // Case 1: Static value (e.g., Asset Type is always 'Stocks')
        const path = Array.isArray(stockConfig.value) ? stockConfig.value : [stockConfig.value];
        this.xmlHandler.updateSecurityAssignments(taxConfig.name || taxonomyId, security.uuid, [
          { path, weight: 10000 },
        ]); // 100% weight
      } else if (stockConfig.sourcePath) {
        // Case 2: Value from Data (SAL or Initial)
        let key: any;

        if (stockConfig.salEndpoint) {
          if (!secid) {
            console.warn(`    [${taxonomyId}] Cannot fetch SAL data without secid.`);
            continue;
          }
          const salData = await this.api.getSalData(secid, stockConfig.salEndpoint);
          if (!salData) {
            console.warn(`    [${taxonomyId}] No SAL data retrieved.`);
            continue;
          }
          key = get(salData, stockConfig.sourcePath);
        } else if (stockConfig.viewId) {
          const id = security.isinOverride || security.isin;
          if (!id) {
            console.warn(`    [${taxonomyId}] Cannot fetch view data without ID.`);
            continue;
          }

          const viewResult = await this.api.getSecurityData(id, stockConfig.viewId);
          // console.debug(security, viewResult);
          if (viewResult && viewResult.data) {
            key = get(viewResult.data, stockConfig.sourcePath);
            // console.debug(security.name, viewResult.data.QuantitativeFairValue, stockConfig.sourcePath, key);
          } else {
            console.warn(`    [${taxonomyId}] No data retrieved for view '${stockConfig.viewId}'.`);
            continue;
          }
        } else {
          // Use data from initial request
          key = get(data, stockConfig.sourcePath);
        }

        const mapping = this.getMapping(stockConfig.mapping);
        if (key) {
          // console.debug(security.name, key, mapping[key]);
          if (!Object.keys(mapping).length) {
            this.xmlHandler.updateSecurityAssignments(taxConfig.name || taxonomyId, security.uuid, [
              { path: [key], weight: 10000 },
            ]); // 100% weight
          } else if (key in mapping) {
            const targetClass = mapping[key];
            if (targetClass) {
              const path = Array.isArray(targetClass) ? targetClass : [targetClass];
              this.xmlHandler.updateSecurityAssignments(taxConfig.name || taxonomyId, security.uuid, [
                { path, weight: 10000 },
              ]); // 100% weight
            }
          } else {
            console.warn(`    [${taxonomyId}] Unmapped stock value '${key}'.`);
          }
        }
      }
    }
  }
}
