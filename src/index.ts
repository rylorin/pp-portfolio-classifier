#!/usr/bin/env node
import * as path from "path";

// Load config
const package_path = path.join(path.dirname(require.resolve("../package.json")), "config");
const runtime_path = path.normalize(path.join(process.cwd(), "config"));
process.env["NODE_CONFIG_DIR"] =
  package_path != runtime_path ? package_path + path.delimiter + runtime_path : runtime_path;
const _config = require("config");
// console.log("Config dir:", package_path, runtime_path, process.env["NODE_CONFIG_DIR"], _config.util.getConfigSources());

import { Classifier } from "./classifier";
import { MorningstarAPI } from "./morningstar-api";
import { XMLHandler } from "./xml-helper";

async function main() {
  const inputFile = process.argv[2];

  if (!inputFile) {
    console.error("Usage: npm start <input_file.xml> [output_file.xml]");
    process.exit(1);
  }

  const outputFile =
    process.argv[3] ||
    path.join(path.dirname(inputFile), path.basename(inputFile, path.extname(inputFile)) + ".categorized.xml");

  // 1. Init modules
  const xmlHandler = new XMLHandler();
  const api = new MorningstarAPI();
  const classifier = new Classifier(xmlHandler, api);

  // 2. Load XML
  try {
    xmlHandler.load(inputFile);
  } catch (e) {
    console.error("Error reading XML:", e);
    process.exit(1);
  }

  // 3. Get Securities
  const securities = xmlHandler.getSecurities();
  console.log(`Found ${securities.length} securities.`);

  // 4. Process loop
  let processedCount = 0;

  for (const sec of securities) {
    // console.log("Processing", sec);
    if (sec.isRetired) continue;
    if (!sec.isin && !sec.isinOverride) {
      console.log(`Skipping ${sec.name} (no ISIN).`);
      continue;
    }

    console.log(`Processing ${sec.name} (${sec.isin})...`);

    try {
      await classifier.classifySecurity(sec);
    } catch (err) {
      console.error(`  Error processing ${sec.isin}:`, err);
    }

    processedCount++;
    // Petit délai pour être gentil avec l'API
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // 5. Save XML (Test de compatibilité: on sauvegarde sans modif pour voir si PP l'ouvre)
  xmlHandler.save(outputFile);
  console.log("Done. Try opening the output file in Portfolio Performance.");
}

main();
