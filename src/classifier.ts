import config from 'config';
import { get, filter as _filter } from 'lodash';
import { XMLHandler } from './xml-helper';
import { MorningstarAPI } from './morningstar-api';
import { PPSecurity } from './types';

interface StockConfig {
    salEndpoint?: 'stock/equityOverview' | 'stock/companyProfile';
    sourcePath?: string;
    isSingleValue?: boolean;
    value?: string | string[]; // For static values
    mapping?: Record<string, string | string[]>;
}

interface TaxonomyConfig {
    active: boolean;
    // Fund config
    sourcePath: string;
    keyField: string;
    valueField: string;
    filter?: Record<string, any>;
    mapping: Record<string, string | string[]>;
    // Stock config
    stockConfig?: StockConfig;
}

export class Classifier {
    private xmlHandler: XMLHandler;
    private api: MorningstarAPI;
    private taxonomiesConfig: Record<string, TaxonomyConfig>;

    constructor(xmlHandler: XMLHandler, api: MorningstarAPI) {
        this.xmlHandler = xmlHandler;
        this.api = api;
        this.taxonomiesConfig = config.get('taxonomies');
    }

    public async classifySecurity(security: PPSecurity) {
        if (!security.isin) return;

        const securityInfo = await this.api.getSecurityData(security.isin);
        if (!securityInfo) {
            console.log(`  > No data found for ${security.name}.`);
            return;
        }

        console.log(`  > Data retrieved for ${security.name}. Type: ${securityInfo.type}. Processing taxonomies...`);

        if (securityInfo.type === 'Stock') {
            await this.classifyStock(security, securityInfo.secid);
        } else if (securityInfo.type === 'Fund') {
            await this.classifyFund(security, securityInfo.data);
        }
    }

    private async classifyFund(security: PPSecurity, data: any) {
        for (const [taxonomyName, taxConfig] of Object.entries(this.taxonomiesConfig)) {
            if (!taxConfig.active) continue;

            // 1. Extract Data
            const sourceData = get(data, taxConfig.sourcePath);
            if (!sourceData) {
                console.warn(`    [${taxonomyName}] No data found at path '${taxConfig.sourcePath}'`);
                continue;
            }
            if (!Array.isArray(sourceData)) {
                console.warn(`    [${taxonomyName}] Data at '${taxConfig.sourcePath}' is not an array.`);
                continue;
            }

            // 2. Filter Data
            let filteredData = sourceData;
            if (taxConfig.filter) {
                filteredData = _filter(sourceData, taxConfig.filter);
            }

            if (filteredData.length === 0) {
                console.log(`    [${taxonomyName}] No items match the filter.`);
                continue;
            }

            // 2.1 Extract BreakdownValues (Flattening)
            // The data we want is usually nested in a 'BreakdownValues' array inside the filtered items
            let itemsToProcess: any[] = [];
            for (const group of filteredData) {
                if (group.BreakdownValues && Array.isArray(group.BreakdownValues)) {
                    itemsToProcess.push(...group.BreakdownValues);
                }
            }

            // 3. Map and Assign
            for (const item of itemsToProcess) {
                const key = item[taxConfig.keyField];
                const value = parseFloat(item[taxConfig.valueField]);

                if (key && value > 0) {
                    if (taxConfig.mapping[key]) {
                        const targetClass = taxConfig.mapping[key];
                        const path = Array.isArray(targetClass) ? targetClass : [targetClass];
                        
                        this.xmlHandler.assignSecurityToTaxonomy(taxonomyName, path, security.uuid, value * 100);
                    } else {
                        console.log(`    [${taxonomyName}] Unmapped key: '${key}' (Value: ${value})`);
                    }
                }
            }
        }
    }

    private async classifyStock(security: PPSecurity, secid: string | null) {
        if (!secid) {
            console.warn(`  > Cannot classify stock ${security.name} without a secid.`);
            return;
        }

        for (const [taxonomyName, taxConfig] of Object.entries(this.taxonomiesConfig)) {
            if (!taxConfig.active || !taxConfig.stockConfig) continue;

            const stockConfig = taxConfig.stockConfig;

            if (stockConfig.isSingleValue && stockConfig.value) {
                // Case 1: Static value (e.g., Asset Type is always 'Stocks')
                const path = Array.isArray(stockConfig.value) ? stockConfig.value : [stockConfig.value];
                this.xmlHandler.assignSecurityToTaxonomy(taxonomyName, path, security.uuid, 10000);
            } else if (stockConfig.salEndpoint && stockConfig.sourcePath && stockConfig.mapping) {
                // Case 2: Value from SAL API
                const salData = await this.api.getSalData(secid, stockConfig.salEndpoint);
                if (!salData) {
                    console.warn(`    [${taxonomyName}] No SAL data retrieved.`);
                    continue;
                }

                const key = get(salData, stockConfig.sourcePath);
                if (key && stockConfig.mapping[key]) {
                    const targetClass = stockConfig.mapping[key];
                    const path = Array.isArray(targetClass) ? targetClass : [targetClass];
                    this.xmlHandler.assignSecurityToTaxonomy(taxonomyName, path, security.uuid, 10000); // 100% weight
                } else if (key) {
                    console.warn(`    [${taxonomyName}] Unmapped stock value '${key}'.`);
                }
            }
        }
    }
}