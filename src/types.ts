export interface PPSecurity {
  uuid: string;
  name: string;
  isin?: string;
  tickerSymbol?: string;
  note?: string;
  isRetired?: string; // Souvent "true" ou "false" en string dans le XML
  isinOverride?: string;
  ignoreTaxonomies?: string[] | boolean;
}

export interface PPTaxonomy {
  id: string;
  name: string;
  root: {
    id: string;
    name: string;
    children?: any;
    assignments?: any;
  };
}

export interface MorningstarData {
  isin: string;
  name: string;
  type: "Fund" | "Stock" | "Unknown";
  data: any; // Le payload JSON complet de l'API
}
