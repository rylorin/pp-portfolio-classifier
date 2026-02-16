import config from "config";
import { filter as _filter, get } from "lodash";
import { MorningstarAPI } from "./morningstar-api";
import { PPSecurity } from "./types";
import { XMLHandler } from "./xml-helper";

interface StockConfig {
  salEndpoint?: "stock/equityOverview" | "stock/companyProfile";
  viewId?: string;
  sourcePath?: string;
  isSingleValue?: boolean;
  value?: string | string[]; // For static values
  mapping?: Record<string, string | string[]> | string;
}

interface TaxonomyConfig {
  active: boolean;
  name: string;
  viewId?: string;
  // Fund config
  sourcePath: string;
  keyField: string;
  valueField: string;
  filter?: Record<string, any>;
  mapping: Record<string, string | string[]> | string;
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

  public async classifySecurity(security: PPSecurity) {
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

  private async classifyFund(security: PPSecurity, data: any) {
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

      // 2.1 Extract BreakdownValues (Flattening)
      // The data we want is usually nested in a 'BreakdownValues' array inside the filtered items
      let itemsToProcess: any[] = [];
      for (const group of filteredData) {
        if (group.BreakdownValues && Array.isArray(group.BreakdownValues)) {
          itemsToProcess.push(...group.BreakdownValues);
        } else {
          itemsToProcess.push(group);
        }
      }

      // 3. Map and Assign
      // console.log(`    [${taxonomyId}] Assigning ${itemsToProcess.length} items...`);
      const assignments: { path: string[]; weight: number }[] = [];
      const mapping = this.getMapping(taxConfig.mapping);
      for (const item of itemsToProcess) {
        const key = item[taxConfig.keyField];
        const value = parseFloat(item[taxConfig.valueField]);

        if (key && value >= 0.01) {
          if (!Object.keys(mapping).length) {
            assignments.push({ path: [key], weight: value * 100 });
          } else if (key in mapping) {
            const targetClass = mapping[key];
            if (targetClass) {
              const path = Array.isArray(targetClass) ? targetClass : [targetClass];
              assignments.push({ path, weight: value * 100 });
              console.log(`    [${taxonomyId}] Mapped '${key}' to '${path.join(" > ")}' (${value.toFixed(2)}%)`);
            }
          } else {
            console.log(`    [${taxonomyId}] Unmapped key: '${key}' (Value: ${value})`);
          }
        }
      }
      this.xmlHandler.updateSecurityAssignments(taxConfig.name || taxonomyId, security.uuid, assignments);
    }
  }

  private async classifyStock(security: PPSecurity, secid: string | null, data: any) {
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
