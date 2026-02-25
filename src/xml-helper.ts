import { randomUUID } from "crypto";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import * as fs from "fs";
import { PPSecurity } from "./types";

const options = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  indentBy: "  ",
  suppressEmptyNode: true,
  isArray: (name: string, jpath: string, isLeafNode: boolean, isAttribute: boolean): boolean => {
    // Force ces éléments à être des tableaux même s'il n'y en a qu'un seul
    const arrayTags = [
      "securities.security",
      "taxonomies.taxonomy",
      "assignments.assignment",
      "children.classification",
    ];
    if (arrayTags.some((tag) => jpath.endsWith(tag))) return true;
    return false;
  },
};

export class XMLHandler {
  private parser: XMLParser;
  private builder: XMLBuilder;
  private xmlData: any;

  constructor() {
    this.parser = new XMLParser(options);
    this.builder = new XMLBuilder(options);
  }

  load(filepath: string): void {
    console.log(`Loading XML file: ${filepath}`);
    const fileContent = fs.readFileSync(filepath, "utf-8");
    this.xmlData = this.parser.parse(fileContent);
  }

  save(filepath: string): void {
    console.log(`Saving XML file to: ${filepath}`);
    const xmlContent = this.builder.build(this.xmlData);
    // Hack pour ajouter l'en-tête XML standard si manquant (PP aime bien l'encodage UTF-8 explicite)
    const finalXml = `<?xml version="1.0" encoding="UTF-8"?>\n${xmlContent}`;
    fs.writeFileSync(filepath, finalXml, "utf-8");
  }

  getSecurities(): PPSecurity[] {
    if (!this.xmlData?.client?.securities?.security) return [];

    return this.xmlData.client.securities.security.map((sec: any) => {
      const security: PPSecurity = {
        uuid: sec.uuid,
        name: sec.name,
        isin: sec.isin,
        note: sec.note,
        isRetired: sec.isRetired,
        isinOverride: undefined,
        ignoreTaxonomies: undefined,
      };

      if (sec.note) {
        const isinMatch = sec.note.match(/#PPC:\[ISIN2=([A-Z0-9]{12})\]/);
        if (isinMatch) security.isinOverride = isinMatch[1];

        const ignoreMatch = sec.note.match(/#PPC:\[ignore(?:=([^\]]+))?\]/);
        if (ignoreMatch) {
          security.ignoreTaxonomies = ignoreMatch[1] ? ignoreMatch[1].split(",").map((s: string) => s.trim()) : true;
        }
      }
      // console.debug(security);
      return security;
    });
  }

  // Méthode utilitaire pour vérifier si le XML est chargé
  isLoaded(): boolean {
    return !!this.xmlData;
  }

  /**
   * Vérifie si une taxonomie existe par son nom.
   */
  taxonomyExists(name: string): boolean {
    if (!this.xmlData?.client?.taxonomies?.taxonomy) {
      return false;
    }
    return this.xmlData.client.taxonomies.taxonomy.some((t: any) => t.name === name);
  }

  /**
   * Finds or creates a taxonomy by name
   */
  getTaxonomy(name: string): any {
    if (!this.xmlData.client.taxonomies) {
      this.xmlData.client.taxonomies = { taxonomy: [] };
    }
    let tax = this.xmlData.client.taxonomies.taxonomy.find((t: any) => t.name === name);
    if (!tax) {
      tax = {
        id: randomUUID(),
        name: name,
        root: {
          id: randomUUID(),
          name: name,
          color: "#89afee",
          children: { classification: [] },
          assignments: { assignment: [] },
          weight: 10000,
          rank: 0,
        },
      };
      this.xmlData.client.taxonomies.taxonomy.push(tax);
    }
    return tax;
  }

  /**
   * Assigns a security to a specific classification path within a taxonomy
   */
  assignSecurityToTaxonomy(taxonomyName: string, path: string[], securityUuid: string, weight: number): void {
    const tax = this.getTaxonomy(taxonomyName);

    // 1. Remove existing assignments for this security in this taxonomy to avoid duplicates
    const securityIndex = this.getSecurityIndex(securityUuid);
    if (securityIndex === -1) {
      console.error(`    [XML] Error: Security UUID ${securityUuid} not found in XML structure.`);
      return;
    }

    // console.log(`    [XML] Updating '${taxonomyName}' -> ${path.join(' > ')}: ${(weight/100).toFixed(2)}%`);

    // 2. Find or create the target classification node
    const targetNode = this.ensureClassificationPath(tax.root, path);

    // 3. Add the new assignment
    if (!targetNode.assignments) targetNode.assignments = { assignment: [] };
    if (!targetNode.assignments.assignment) targetNode.assignments.assignment = [];

    // Calculate depth for relative reference (Root is depth 0)
    const depth = path.length;
    const securityRef = this.getSecurityReference(securityIndex, depth);

    // Check if assignment already exists to avoid duplicates in the same node
    const existingAssignmentIndex = targetNode.assignments.assignment.findIndex(
      (a: any) => a.investmentVehicle && a.investmentVehicle["@_reference"] === securityRef,
    );

    const newAssignment = {
      investmentVehicle: {
        "@_class": "security",
        "@_reference": securityRef,
      },
      weight: Math.round(weight),
      rank: 0,
    };

    if (existingAssignmentIndex !== -1) {
      targetNode.assignments.assignment[existingAssignmentIndex] = newAssignment;
    } else {
      targetNode.assignments.assignment.push(newAssignment);
    }
  }

  /**
   * Removes all assignments for a specific security in a given taxonomy.
   */
  removeSecurityFromTaxonomy(taxonomyName: string, securityUuid: string): void {
    const tax = this.getTaxonomy(taxonomyName);
    const securityIndex = this.getSecurityIndex(securityUuid);

    if (securityIndex === -1) return;

    const removeRecursive = (node: any, depth: number): void => {
      if (node.assignments && node.assignments.assignment) {
        const securityRef = this.getSecurityReference(securityIndex, depth);
        node.assignments.assignment = node.assignments.assignment.filter(
          (a: any) => !a.investmentVehicle || a.investmentVehicle["@_reference"] !== securityRef,
        );
      }

      if (node.children && node.children.classification) {
        node.children.classification.forEach((child: any) => removeRecursive(child, depth + 1));
      }
    };

    removeRecursive(tax.root, 0);
  }

  /**
   * Updates assignments for a security in a taxonomy.
   * If assignments are provided, it clears existing ones first .
   * If no assignments are provided, it leaves existing ones untouched.
   */
  updateSecurityAssignments(
    taxonomyName: string,
    securityUuid: string,
    assignments: { path: string[]; weight: number }[],
  ): void {
    if (!assignments || assignments.length === 0) return;

    this.removeSecurityFromTaxonomy(taxonomyName, securityUuid);

    for (const assignment of assignments) {
      this.assignSecurityToTaxonomy(taxonomyName, assignment.path, securityUuid, assignment.weight);
    }
  }

  private ensureClassificationPath(root: any, path: string[]): any {
    let current = root;
    for (const segment of path) {
      if (!current.children) current.children = { classification: [] };
      if (!current.children.classification) current.children.classification = [];

      let nextNode = current.children.classification.find((c: any) => c.name === segment);
      if (!nextNode) {
        nextNode = {
          id: randomUUID(),
          name: segment,
          color: "#89afee",
          parent: { "@_reference": `../../..` },
          children: { classification: [] },
          assignments: { assignment: [] },
          weight: 0,
          rank: 0,
        };
        current.children.classification.push(nextNode);
      }
      current = nextNode;
    }
    return current;
  }

  private getSecurityIndex(uuid: string): number {
    if (!this.xmlData?.client?.securities?.security) return -1;
    return this.xmlData.client.securities.security.findIndex((s: any) => s.uuid === uuid);
  }

  private getSecurityReference(index: number, depth: number): string {
    // Base depth calculation:
    // Taxonomy(Root) -> Children -> Classif -> Assignments -> Assignment -> InvVehicle
    // 6 levels up to Client for depth 0 (direct child of root)
    // For each nesting level, add 2 levels (Children + Classification)
    const levelsUp = 6 + depth * 2;
    const prefix = "../".repeat(levelsUp);
    const suffix = index === 0 ? "securities/security" : `securities/security[${index + 1}]`;
    return `${prefix}${suffix}`;
  }
}
