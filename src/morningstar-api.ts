import axios, { AxiosError } from "axios";
import config from "config";

/*
  Useful Morningstar Postman workspace for exploring the API
  https://www.postman.com/dynamic-services-morningstar-com/morningstar-direct-web-services/request/pnun7vq/investment-details-mutual-fund-snapshot-view
*/

// Define a type for the security data response
interface SecurityDataResponse {
  type: "Fund" | "Stock" | "Unknown";
  data: any;
  secid: string | null;
}

export class MorningstarAPI {
  private bearerToken: string = "";
  private domain: string;
  private baseUrl: string;
  private salBaseUrl: string;
  private viewId: string;

  constructor() {
    this.domain = config.get("morningstar.domain");
    this.baseUrl = config.get("morningstar.baseUrl");
    this.salBaseUrl = config.get("morningstar.salBaseUrl");
    this.viewId = config.get("morningstar.viewId");
  }

  private async getBearerToken(): Promise<string> {
    if (this.bearerToken) return this.bearerToken;

    console.log("Fetching Morningstar Bearer Token...");
    const url = `https://www.morningstar.${this.domain}/Common/funds/snapshot/PortfolioSAL.aspx`;

    try {
      const response = await axios.get(url);
      const tokenRegex = /const maasToken \=\s\"(.+)\"/;
      const match = response.data.match(tokenRegex);

      if (match && match[1]) {
        this.bearerToken = match[1];
        // console.debug("Got Bearer Token:", this.bearerToken);
        return this.bearerToken;
      } else {
        throw new Error("Token regex failed");
      }
    } catch (error) {
      console.error("Failed to get Bearer Token", error);
      throw error;
    }
  }

  /**
   * Récupère des données complémentaires via une vue spécifique (ex: 'snapshot').
   * Peut être utilisé avec un ISIN ou un SecId.
   */
  async getSecurityData(id: string, viewId?: string, idType: "ISIN" | "SecId" = "ISIN"): Promise<any> {
    const token = await this.getBearerToken();

    const url = `${this.baseUrl}/securities/${id}`;
    const params = {
      idtype: idType,
      viewid: viewId || this.viewId,
      currencyId: "EUR",
      responseViewFormat: "json",
      languageId: "en-UK",
    };
    const headers = { Authorization: `Bearer ${token}`, accept: "*/*" };

    try {
      const response = await axios.get(url, { params, headers });
      if (response.data && response.data.length > 0) {
        const securityInfo = response.data[0];
        // if (isin == "NL0011585146") console.debug(isin, securityInfo);
        return {
          type: securityInfo.Type as "Fund" | "Stock",
          data: securityInfo,
          secid: securityInfo.Id || id, // Fallback to ISIN if SecId is missing (SAL API often accepts ISIN)
        };
      }
      // If response is empty (200 OK but no data), try fallback
      console.log(`  > ecint API returned empty for ${id}, trying website search fallback...`);
      return this.findSecidFromWebsite(id);
    } catch (error) {
      if ((error as AxiosError).response?.status === 401) {
        // This can happen for stocks not covered by this endpoint. Try the fallback.
        console.log(`  > ecint API failed for ${id}, trying website search fallback...`);
        return this.findSecidFromWebsite(id);
      }
      console.warn(`  Warning: Could not fetch data for ${id} from ecint API. Error: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Récupère des données détaillées pour les actions via l'API SAL.
   */
  async getSalData(secid: string, endpoint: "stock/equityOverview" | "stock/companyProfile"): Promise<any> {
    const token = await this.getBearerToken();

    let url = `${this.salBaseUrl}/${endpoint}`;
    let params: Record<string, string> = {
      languageId: "en-UK",
      locale: "en",
    };
    const headers = { Authorization: `Bearer ${token}`, accept: "*/*" };

    if (endpoint === "stock/equityOverview") {
      url += `/${secid}/data`;
      params.version = "4.65.0";
    } else {
      // companyProfile
      url += `/${secid}`;
    }

    try {
      const response = await axios.get(url, { params, headers });
      return response.data;
    } catch (error) {
      console.warn(`  Warning: Could not fetch SAL data for secid ${secid} from endpoint ${endpoint}.`);
      console.debug(url, params);
      return null;
    }
  }

  /**
   * Fallback: Trouve le SecId d'un titre en cherchant sur le site de Morningstar.
   * C'est utile pour les actions qui ne sont pas dans l'API ecint.
   */
  private async findSecidFromWebsite(isin: string): Promise<SecurityDataResponse | null> {
    const url = `https://global.morningstar.com/api/v1/${this.domain}/search/securities`;
    const params = { query: `((isin ~= "${isin}"))` };
    const headers = { "user-agent": "Mozilla/5.0" };

    try {
      const response = await axios.get(url, { params, headers });
      const results = response.data?.results;
      if (results && results.length > 0) {
        const secid = results[0].securityID;
        const universe = results[0].universe;
        const type = universe === "EQ" ? "Stock" : "Unknown";

        if (type === "Stock") {
          console.log(`  > Found secid '${secid}' for stock ${isin} via fallback.`);
          return { type: "Stock", data: null, secid: secid };
        }
      }
      return null;
    } catch (error) {
      console.warn(`  Warning: Fallback search for ${isin} failed.`);
      return null;
    }
  }
}
