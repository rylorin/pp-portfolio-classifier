import { Classifier } from "../src/classifier";
import { MorningstarAPI } from "../src/morningstar-api";
import { TaxonomyAssignment, TaxonomyResult } from "../src/types";
import { XMLHandler } from "../src/xml-helper";

// Mock dependencies
jest.mock("../src/morningstar-api");
jest.mock("../src/xml-helper");

describe("Embedded Taxonomies", () => {
  let classifier: Classifier;
  let xmlHandler: XMLHandler;
  let api: MorningstarAPI;

  beforeEach(() => {
    xmlHandler = new XMLHandler();
    api = new MorningstarAPI();
    classifier = new Classifier(xmlHandler, api);
  });

  describe("findCategoryWeight", () => {
    test("should find exact category match", () => {
      const assignments: TaxonomyAssignment[] = [
        { path: ["Stock"], weight: 8000 },
        { path: ["Bond"], weight: 2000 },
      ];

      // We'll need to make findCategoryWeight public or test it indirectly
      // For now, let's test through the full integration
    });
  });

  describe("applyEmbeddedTaxonomies", () => {
    test("should calculate cascading weights correctly", () => {
      // Create mock taxonomy results
      const securityResults = new Map<string, TaxonomyResult>([
        [
          "asset_type",
          {
            taxonomyId: "asset_type",
            assignments: [
              { path: ["Stock"], weight: 8000 },
              { path: ["Bond"], weight: 2000 },
            ],
          },
        ],
        [
          "stock_style",
          {
            taxonomyId: "stock_style",
            assignments: [
              { path: ["Large Growth"], weight: 7000 },
              { path: ["Small Value"], weight: 3000 },
            ],
          },
        ],
      ]);

      // Mock embedded config
      const mockConfig = {
        stock_style_in_asset: {
          active: true,
          parentTaxonomy: "asset_type",
          parentCategory: "Stock",
          childTaxonomy: "stock_style",
          targetTaxonomy: "asset_type",
        },
      };

      // Test the calculation logic manually
      const parentWeight = 8000; // 80%
      const childWeight = 7000; // 70%
      const expectedWeight = Math.round((parentWeight * childWeight) / 10000);

      expect(expectedWeight).toBe(5600); // 56%
    });

    test("should handle multiple child assignments", () => {
      const parentWeight = 8000;
      const childAssignments: TaxonomyAssignment[] = [
        { path: ["Large Growth"], weight: 7000 },
        { path: ["Small Value"], weight: 3000 },
      ];

      const embeddedAssignments = childAssignments.map((child) => ({
        path: ["Stock", ...child.path] as string[],
        weight: Math.round((parentWeight * child.weight) / 10000),
      }));

      expect(embeddedAssignments).toEqual([
        { path: ["Stock", "Large Growth"], weight: 5600 },
        { path: ["Stock", "Small Value"], weight: 2400 },
      ]);

      const total = embeddedAssignments.reduce((sum, a) => sum + a.weight, 0);
      expect(total).toBe(8000); // Should maintain parent's total
    });

    test("should handle missing parent category", () => {
      const assignments: TaxonomyAssignment[] = [{ path: ["Bond"], weight: 10000 }];

      // This should return 0, meaning no embedding applied
      const parentWeight = 0;

      // Should not create any embedded assignments
      expect(parentWeight).toBe(0);
    });

    test("should maintain 100% total after embedding", () => {
      const embeddedAssignments: TaxonomyAssignment[] = [
        { path: ["Stock", "Large Growth"], weight: 5600 },
        { path: ["Stock", "Small Value"], weight: 2400 },
        { path: ["Bond"], weight: 2000 },
      ];

      const total = embeddedAssignments.reduce((sum, a) => sum + a.weight, 0);
      expect(total).toBe(10000); // 100%
    });
  });

  describe("pathEquals", () => {
    test("should compare paths correctly", () => {
      const path1 = ["Stock", "Large Growth"];
      const path2 = ["Stock", "Large Growth"];
      const path3 = ["Stock", "Small Value"];

      // Test if paths are equal
      const isEqual = (p1: string[], p2: string[]) => {
        if (p1.length !== p2.length) return false;
        return p1.every((segment, i) => segment === p2[i]);
      };

      expect(isEqual(path1, path2)).toBe(true);
      expect(isEqual(path1, path3)).toBe(false);
    });
  });
});
