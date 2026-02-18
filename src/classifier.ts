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

      let hasNegativeWeights = false;
      let totalWeight = 0;

      // 3. Map and Assign
      // console.log(`    [${taxonomyId}] Assigning ${itemsToProcess.length} items...`);
      const assignments: { path: string[]; weight: number }[] = [];
      const mapping = this.getMapping(taxConfig.mapping);
      for (const item of itemsToProcess) {
        const key = item[taxConfig.keyField];
        const value = item[taxConfig.valueField];
        const weight = Math.round(parseFloat(value) * 100);

        if (key && weight > 0) {
          if (!Object.keys(mapping).length) {
            assignments.push({ path: [key], weight });
            totalWeight += weight;
          } else if (key in mapping) {
            const targetClass = mapping[key];
            if (targetClass) {
              const path = Array.isArray(targetClass) ? targetClass : [targetClass];
              assignments.push({ path, weight });
              totalWeight += weight;
              // console.debug(`    [${taxonomyId}] Mapping key '${key}' -> '${path.join(" > ")}' (${value}% -> ${weight})`);
            }
          } else {
            console.log(`    [${taxonomyId}] Unmapped key: '${key}' (Value: ${weight / 100})`);
          }
        } else if (weight < 0) {
          hasNegativeWeights = true;
          // console.log(`    [${taxonomyId}] Negative weight for key: '${key}' (Value: ${weight / 100})`);
        }
      }

      /*
      Disabled as the deviation comes from short positions data, for example:
      Processing Invesco Preferred Shares UCITS ETF EUR Hedged Dist (IE00BDT8V027)...
      > Data retrieved for Invesco Preferred Shares UCITS ETF EUR Hedged Dist. Type: Fund. Processing taxonomies...
        > bond_sector
        [bond_sector] Mapping key '3030' to 'Corporate Bond' (255 / 2.54658)
        [bond_sector] Mapping key '3040' to 'Preferred' (9725 / 97.25188)
        [bond_sector] Mapping key '5010' to 'Cash & Equivalents' (25 / 0.25239)
        [bond_sector] Negative weight for key: '6020' (Value: -0.05)
        [bond_sector] Total weight is 100.05%. Deviation of 5 is too large (max allowed: 10) or negative values exist. Skipping correction.

      // 4. Adjust breakdown to ensure total is 100%
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
