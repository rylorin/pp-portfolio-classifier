import config from "config";
import { filter as _filter, get } from "lodash";
import { MorningstarAPI } from "./morningstar-api";
import { EmbeddedTaxonomyConfig, PPSecurity, TaxonomyResult } from "./types";
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
  active: boolean | "auto";
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
  /**
   * Limit the number of items processed after flattening.
   * Useful with viewId "AllHoldings" to emulate a "Top100" behaviour:
   * set viewId to "AllHoldings" and maxItems to 100.
   * Items are taken in the order returned by the API (already sorted by weight desc).
   */
  maxItems?: number;
  /**
   * Field name to use for NotClassified adjustment.
   * If set, each Breakdown value will be multiplied by (1 - NotClassified/100)
   * to get the correct overall weight. Common value: "NotClassified".
   */
  notClassifiedField?: string;

  // Stock config
  stockConfig?: StockConfig;
}

type Assignment = { path: string[]; weight: number };

export class Classifier {
  private xmlHandler: XMLHandler;
  private api: MorningstarAPI;
  private taxonomiesConfig: Record<string, TaxonomyConfig>;
  private globalMappings: Record<string, Record<string, string | string[]>>;
  private embeddedTaxonomiesConfig: Record<string, EmbeddedTaxonomyConfig>;

  constructor(xmlHandler: XMLHandler, api: MorningstarAPI) {
    this.xmlHandler = xmlHandler;
    this.api = api;
    this.taxonomiesConfig = config.get("taxonomies");
    this.globalMappings = config.has("mappings") ? config.get("mappings") : {};
    this.embeddedTaxonomiesConfig = config.has("embeddedTaxonomies") ? config.get("embeddedTaxonomies") : {};
  }

  private isExplicitlyActive(taxConfig: TaxonomyConfig): boolean {
    return taxConfig.active === true || (taxConfig.active === "auto" && this.xmlHandler.taxonomyExists(taxConfig.name));
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
      await this.classifyStock(security, securityInfo.secid as string, securityInfo.data);
    } else if (securityInfo.type === "Fund") {
      await this.classifyFund(security, securityInfo.data);
    } else {
      console.error(`  > Unknown security type: ${securityInfo.type}! Skipping...`);
    }
  }

  private async classifyFund(security: PPSecurity, data: any): Promise<void> {
    const securityResults: Map<string, TaxonomyResult> = new Map<string, TaxonomyResult>();

    for (const [taxonomyId, taxConfig] of Object.entries(this.taxonomiesConfig)) {
      // Check if this taxonomy should be processed:
      // 1. If it's explicitly active
      // 2. OR if it's needed for an active nested taxonomy
      const isNeededForEmbedding = this.isTaxonomyNeededForEmbedding(taxonomyId);
      const isExplicitlyActive = this.isExplicitlyActive(taxConfig);

      if (!isExplicitlyActive && !isNeededForEmbedding) {
        continue;
      }
      // Check if this taxonomy is ignored for this security (from the Note field)
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
      let filteredData = sourceData;
      if (taxConfig.filter) {
        filteredData = _filter(sourceData, taxConfig.filter);
      }
      if (filteredData.length === 0) {
        console.log(`    [${taxonomyId}] No items match the filter.`);
        continue;
      }
      // console.debug(filteredData);

      if (!taxConfig.multigroup && filteredData.length > 1) filteredData = [filteredData[0]];

      // 2.1 Extract BreakdownValues (Flattening)
      // The data we want is usually nested in a 'BreakdownValues' array inside the filtered items
      // Also extract NotClassified value if configured for this taxonomy
      interface GroupWithNotClassified {
        items: any[];
        notClassified: number;
      }
      const groupsWithNotClassified: GroupWithNotClassified[] = [];
      for (const group of filteredData) {
        let notClassified = 0;
        if (taxConfig.notClassifiedField) {
          const ncValue = group[taxConfig.notClassifiedField];
          if (typeof ncValue === "number") {
            notClassified = ncValue;
          }
        }
        let items: any[] = [];
        if (group.BreakdownValues && Array.isArray(group.BreakdownValues)) {
          items.push(...group.BreakdownValues); // eslint-disable-line @typescript-eslint/no-unsafe-argument
        } else {
          items.push(group);
        }
        groupsWithNotClassified.push({ items, notClassified });
      }

      // 2.2 Limit items if maxItems is configured (e.g. "Top100" via AllHoldings)
      // Apply limit to each group separately
      for (const groupData of groupsWithNotClassified) {
        if (taxConfig.maxItems && taxConfig.maxItems > 0 && groupData.items.length > taxConfig.maxItems) {
          console.log(
            `    [${taxonomyId}] Limiting group to ${taxConfig.maxItems} items (got ${groupData.items.length}).`,
          );
          groupData.items = groupData.items.slice(0, taxConfig.maxItems);
        }
      }

      // 3. Map and Assign
      // console.log(`    [${taxonomyId}] Assigning ${itemsToProcess.length} items...`);
      let assignments: Assignment[] = [];
      assignments = this.assignItemsFromGroups(taxConfig, groupsWithNotClassified, assignments, taxonomyId);

      // Store results for nested processing
      securityResults.set(taxonomyId, { taxonomyId, assignments });
    }

    // Apply nested taxonomies if configured
    const embeddedResults = this.applyEmbeddedTaxonomies(securityResults);

    // 5. Update the XML with final results
    // Only create standalone taxonomy entries for active taxonomies
    for (const [taxonomyId, result] of embeddedResults.entries()) {
      const taxConfig = this.taxonomiesConfig[taxonomyId];
      if (taxConfig) {
        const isExplicitlyActive = this.isExplicitlyActive(taxConfig);

        if (isExplicitlyActive) {
          // Normalize breakdown
          result.assignments = this.normalizeBreakdown(result.assignments, taxonomyId);
          // Then update the XML
          this.xmlHandler.updateSecurityAssignments(taxConfig.name || taxonomyId, security.uuid, result.assignments);
        }
      }
    }
  }

  private assignItems(
    taxConfig: TaxonomyConfig,
    itemsToProcess: any[],
    assignments: Assignment[],
    taxonomyId: string,
  ): Assignment[] {
    const mapping = this.getMapping(taxConfig.mapping);
    for (const item of itemsToProcess) {
      const key = item[taxConfig.keyField];
      const value = item[taxConfig.valueField];

      if (key && value) {
        const weight = value * 100;
        if (Number.isNaN(weight)) {
          console.warn(`    [${taxonomyId}] Invalid weight for key: '${key}' (Value: ${value})`);
          continue;
        }
        if (!Object.keys(mapping).length) {
          // Check if an assignment with this path already exists and accumulate weights
          const existingAssignment = assignments.find((a) => this.pathEquals(a.path, [key as string]));
          if (existingAssignment) {
            existingAssignment.weight += weight;
          } else {
            assignments.push({ path: [key], weight });
          }
        } else if (key in mapping) {
          const targetClass = mapping[key];
          if (targetClass) {
            const path = Array.isArray(targetClass) ? targetClass : [targetClass];
            if (weight > 0) {
              // Check if an assignment with this path already exists and accumulate weights
              const existingAssignment = assignments.find((a) => this.pathEquals(a.path, path));
              if (existingAssignment) {
                existingAssignment.weight += weight;
              } else {
                assignments.push({ path, weight });
              }
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
        // console.warn(`    [${taxonomyId}] No key ${key} or value ${value} for item`);
      }
    }
    return assignments;
  }

  private assignItemsFromGroups(
    taxConfig: TaxonomyConfig,
    groups: { items: any[]; notClassified: number }[],
    assignments: Assignment[],
    taxonomyId: string,
  ): Assignment[] {
    const mapping = this.getMapping(taxConfig.mapping);
    const hasNotClassifiedConfig = !!taxConfig.notClassifiedField;

    for (const group of groups) {
      const notClassified = group.notClassified;
      const adjustmentFactor = notClassified > 0 ? (1 - notClassified / 100) : 1;

      if (hasNotClassifiedConfig && notClassified > 0) {
        console.log(
          `    [${taxonomyId}] Applying NotClassified adjustment: ${notClassified}% -> factor ${adjustmentFactor.toFixed(4)}`,
        );
      }

      for (const item of group.items) {
        const key = item[taxConfig.keyField];
        const rawValue = item[taxConfig.valueField];

        if (key && rawValue) {
          const rawWeight = rawValue * 100;
          const weight = rawWeight * adjustmentFactor;
          if (Number.isNaN(weight)) {
            console.warn(`    [${taxonomyId}] Invalid weight for key: '${key}' (Value: ${rawValue})`);
            continue;
          }
          if (!Object.keys(mapping).length) {
            const existingAssignment = assignments.find((a) => this.pathEquals(a.path, [key as string]));
            if (existingAssignment) {
              existingAssignment.weight += weight;
            } else {
              assignments.push({ path: [key], weight });
            }
          } else if (key in mapping) {
            const targetClass = mapping[key];
            if (targetClass) {
              const path = Array.isArray(targetClass) ? targetClass : [targetClass];
              if (weight > 0) {
                const existingAssignment = assignments.find((a) => this.pathEquals(a.path, path));
                if (existingAssignment) {
                  existingAssignment.weight += weight;
                } else {
                  assignments.push({ path, weight });
                }
              } else {
                console.warn(
                  `    [${taxonomyId}] Negative or null weight for key: '${key}' ignored (Value: ${weight / 100})`,
                );
              }
            }
          } else {
            console.warn(`    [${taxonomyId}] Unmapped key: '${key}' (Value: ${rawValue})`);
          }
        }
      }
    }
    return assignments;
  }

  private normalizeBreakdown(assignments: Assignment[], taxonomyId: string): Assignment[] {
    const result = assignments
      .filter((a) => a && a.weight > 0)
      .map((a) => ({ path: a.path, weight: Math.round(a.weight) }));
    const totalWeight = result.reduce((sum, assignment) => sum + assignment.weight, 0);
    if (totalWeight > 100_00) {
      result.sort((a, b) => b.weight - a.weight);
      let totalWeight = 0;
      for (let i = 0; i < result.length; i++) {
        if (totalWeight + result[i].weight > 100_00) {
          result[i].weight = 100_00 - totalWeight;
          console.log(
            `    [${taxonomyId}] Ceiling weight for '${result[i].path.join(" > ")}' to ${result[i].weight / 100}%`,
          );
          if (result[i].weight == 0) delete result[i]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
          totalWeight = 100_00;
        } else totalWeight += result[i].weight;
      }
    }
    return result.filter((a) => a && a.weight > 0);
  }

  private applyEmbeddedTaxonomies(securityResults: Map<string, TaxonomyResult>): Map<string, TaxonomyResult> {
    // Clone the results to avoid modifying the original
    const results = new Map<string, TaxonomyResult>();
    for (const [key, value] of securityResults.entries()) {
      results.set(key, {
        taxonomyId: value.taxonomyId,
        assignments: [...value.assignments],
      });
    }

    for (const [configId, config] of Object.entries(this.embeddedTaxonomiesConfig)) {
      if (!config.active) continue;

      console.log(`    [Nested] Processing ${configId}...`);

      // 1. Get parent and child results
      const parentResult = results.get(config.parentTaxonomy);
      const childResult = results.get(config.childTaxonomy);
      const targetResult = results.get(config.targetTaxonomy);

      if (!parentResult || !childResult || !targetResult) {
        console.log(`      [Nested] Skipping ${configId}: missing taxonomy data`);
        continue;
      }

      // 2. Find parent category weight
      const parentWeight = this.findCategoryWeight(parentResult.assignments, config.parentCategory);

      if (parentWeight === 0) {
        console.log(
          `      [Nested] Skipping ${configId}: parent category '${config.parentCategory}' not found or has 0% weight`,
        );
        continue;
      }

      console.log(`      [Nested] Parent '${config.parentCategory}' weight: ${Math.round(parentWeight) / 100}%`);

      // 3. Create nested assignments
      const embeddedAssignments: Assignment[] = childResult.assignments.map((childAssignment) => ({
        path: [config.parentCategory, ...childAssignment.path],
        weight: Math.round((parentWeight * childAssignment.weight) / 10_000),
      }));

      console.log(`      [Nested] Created ${embeddedAssignments.length} subcategories`);

      // 4. Replace parent category with nested assignments in target
      targetResult.assignments = targetResult.assignments.filter(
        (assignment) => !this.pathEquals(assignment.path, [config.parentCategory]),
      );

      targetResult.assignments.push(...embeddedAssignments);

      // 5. Fix breakdown if needed
      // targetResult.assignments = this.normalizeBreakdown(targetResult.assignments, config.targetTaxonomy);
    }

    return results;
  }

  private findCategoryWeight(assignments: Assignment[], category: string): number {
    const assignment = assignments.find((a) => a.path.length === 1 && a.path[0] === category);
    return assignment ? assignment.weight : 0;
  }

  private pathEquals(path1: string[], path2: string[]): boolean {
    if (path1.length !== path2.length) return false;
    return path1.every((segment, i) => segment === path2[i]);
  }

  private isTaxonomyNeededForEmbedding(taxonomyId: string): boolean {
    for (const config of Object.values(this.embeddedTaxonomiesConfig)) {
      if (config.active && (config.childTaxonomy === taxonomyId || config.parentTaxonomy === taxonomyId)) {
        return true;
      }
    }
    return false;
  }

  private async classifyStock(security: PPSecurity, secid: string | null, data: any): Promise<void> {
    const securityResults: Map<string, TaxonomyResult> = new Map<string, TaxonomyResult>();

    if (!secid && !data) {
      console.warn(`  > Cannot classify stock ${security.name} without data.`);
      return;
    }

    for (const [taxonomyId, taxConfig] of Object.entries(this.taxonomiesConfig)) {
      // Check if this taxonomy should be processed:
      // 1. If it's explicitly active
      // 2. OR if it's needed for an active nested taxonomy
      const isNeededForEmbedding = this.isTaxonomyNeededForEmbedding(taxonomyId);
      const isExplicitlyActive = this.isExplicitlyActive(taxConfig);

      if (!isExplicitlyActive && !isNeededForEmbedding) {
        continue;
      }
      if (
        security.ignoreTaxonomies !== undefined &&
        (security.ignoreTaxonomies === true || (security.ignoreTaxonomies as string[]).includes(taxonomyId))
      )
        continue;
      if (!taxConfig.stockConfig) continue;
      console.log(`    > ${taxonomyId}`);

      const stockConfig = taxConfig.stockConfig;

      const assignments: Assignment[] = [];

      if (stockConfig.isSingleValue && stockConfig.value) {
        // Case 1: Static value (e.g., Asset Type is always 'Stocks')
        const path = Array.isArray(stockConfig.value) ? stockConfig.value : [stockConfig.value];
        assignments.push({ path, weight: 10000 }); // 100% weight
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
            assignments.push({ path: [key], weight: 10000 });
          } else if (key in mapping) {
            const targetClass = mapping[key];
            if (targetClass) {
              const path = Array.isArray(targetClass) ? targetClass : [targetClass];
              assignments.push({ path, weight: 10000 });
            }
          } else {
            console.warn(`    [${taxonomyId}] Unmapped stock value '${key}'.`);
          }
        }
      }

      // Store results for nested processing
      if (assignments.length > 0) {
        securityResults.set(taxonomyId, { taxonomyId, assignments });
      }
    }

    // Apply nested taxonomies if configured
    const embeddedResults = this.applyEmbeddedTaxonomies(securityResults);

    // Update the XML with final results
    // Only create standalone taxonomy entries for active taxonomies
    for (const [taxonomyId, result] of embeddedResults.entries()) {
      const taxConfig = this.taxonomiesConfig[taxonomyId];
      if (taxConfig) {
        const isExplicitlyActive = this.isExplicitlyActive(taxConfig);

        if (isExplicitlyActive) {
          this.xmlHandler.updateSecurityAssignments(taxConfig.name || taxonomyId, security.uuid, result.assignments);
        }
      }
    }
  }
}
