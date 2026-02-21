# 🤖 Portfolio Performance Classifier (TypeScript)

![Version](https://img.shields.io/github/package-json/v/rylorin/pp-portfolio-classifier)
[![Publish](https://github.com/rylorin/pp-portfolio-classifier/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/rylorin/pp-portfolio-classifier/actions/workflows/npm-publish.yml)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Downloads](https://img.shields.io/npm/dt/pp-portfolio-classifier.svg)

This project is an automation tool for [Portfolio Performance](https://www.portfolio-performance.info/). It automatically classifies your securities (Funds, ETFs, Stocks) by retrieving data from Morningstar.

It is a **TypeScript** adaptation and rewrite of the Python project [Alfons1Qto12/pp-portfolio-classifier](https://github.com/Alfons1Qto12/pp-portfolio-classifier), offering strong typing, and more flexible configuration.

## 🌟 Features

- **Multi-Type Support**: Handles Funds/ETFs as well as Stocks (via Morningstar SAL API).
- **Automatic Taxonomies**: Creates and updates classifications in your XML file:
  - Asset Allocation (Equity, Bond, Cash, etc.)
  - Regions (Americas, Europe, Asia, etc.)
  - Sectors (Technology, Healthcare, Finance, etc.)
- **Non-destructive**: Generates a new XML file by default to avoid overwriting your data without verification.
- **Configurable**: Customize the script's behavior (language, taxonomies, etc.) via a configuration file.
- **Multi-levels taxonomies**: Supports nested taxonomies (e.g., "Europe > Germany").

## 🧠 How it works

1. **Parsing**: The script reads your `.xml` file and extracts all securities with a valid ISIN.
2. **Data Retrieval**: It queries Morningstar APIs to fetch:
   - **Asset Allocation**: Breakdown by asset type (Cash, Stocks, Bonds, etc.).
   - **World Regions**: Geographical breakdown (Americas, Europe, Asia, etc.).
   - **Sectors**: Industry breakdown (Technology, Healthcare, Energy, etc.).
3. **Classification**: It maps the retrieved data to the taxonomies defined in your configuration.
4. **Generation**: A new XML file is generated containing your original data plus the new classification categories and assignments.

## 📌 Prerequisites

- [Node.js](https://nodejs.org/) (v22 or higher recommended)

## 🚀 Installation & Usage

### Installation

No installation is required, `npx` will download and install on the fly the latest release of the package.

### Usage

To run the classification on your portfolio file:

```bash
npx pp-portfolio-classifier -- <path_to_your_portfolio.xml> [output_path.xml]
```

- **Input** - The path to your current Portfolio Performance `.xml` file.

- **Output** (Optional): The path to save the modified file. Default: input file with suffix `.classified.xml`.

## ⚙️ Configuration

The project uses `node-config` for configuration management.

### Customization (Language and Taxonomies)

You can customize the script's behavior (change the taxonomy language, modify the Morningstar domain, etc.) by creating a `config/local.json` file. This file will override the default values ​​defined in `config/default.json`.

**Available Taxonomies:**

- `asset_type`
- `region`
- `country`
- `country_by_region`
- `stock_style`
- `stock_sector`
- `bond_sector`
- `holding`

This is ideal for adapting category names to your language or personal preferences.

**Example of `config/local.json`:**

```json
{
  "mappings": {
    "AssetTypeMap": {
      "1": ["Actions"],
      "3": "Obligations",
      "5": ["Obligations", "Hybrides", "Préférentielles"],
      "6": ["Obligations", "Hybrides", "Convertibles"],
      "7": "Liquidités & équivalents",
      "8": "Autres",
      "99": "Autres"
    }
  },
  "taxonomies": {
    "asset_type": {
      "active": true,
      "name": "Classes d’actifs",
      "stockConfig": {
        "value": ["Actions"]
      }
    },
    "country_by_region": { "active": true, "name": "Zones économiques" },
    "stock_sector": { "active": true },
    "region": { "active": false },
    "country": { "active": false },
    "holding": { "active": false }
  }
}
```

### How Mappings Work

The classification logic relies on mapping tables defined in the configuration files (config/default.json and config/local.json) to translate Morningstar data into your Portfolio Performance taxonomies.

- Direct Value: For some taxonomies like holding, no mapping table is used. The script directly uses the value provided by Morningstar (e.g., the security name).
- Mapped Value: For most taxonomies, a mapping table is used to convert a code or an ID from Morningstar into a human-readable category name. For instance, AssetTypeMap converts the code 1 to "Stock". If a code is mapped to `null`, that specific data point is ignored. This is crucial for avoiding inconsistencies. For example, the region breakdown from Morningstar includes both geographical regions (like "Europe", "Asia") and market types ("Developed Markets", "Emerging Markets"). Without ignoring the market types, the total allocation could exceed 100%. By mapping them to `null`, we ensure only the geographical regions are used for the classification.

### Advanced Usage: Security Notes Flags

You can control the classification behavior for specific securities by adding special flags to the **Note** field in Portfolio Performance.

- **Override ISIN**: Use a different ISIN for Morningstar lookup (useful if the security's main ISIN is not found or incorrect in Morningstar).
  `#PPC:[ISIN2=US0000000000]`

- **Ignore Classification**: Prevent the script from classifying a specific security.
  - Ignore all taxonomies: `#PPC:[ignore]`
  - Ignore specific taxonomies (comma separated): `#PPC:[ignore=asset_type,region]`

## ⚠️ Known Limitations

- **Multi-Asset Fund Breakdowns**
  Currently, the tool may produce inconsistent classifications for funds holding multiple asset classes (e.g., 90% Stocks, 10% Bonds).
  Morningstar reports a breakdown relative to a specific asset class (e.g., "100% of Bonds are Government Bonds"), therfore this percentage will apply to the **entire fund** instead of weighting it by the asset class portion (i.e., 100% of the 10%).
  This means a fund with only 10% bonds could be classified as 100% Government Bonds in that specific taxonomy. This is how Morningstar reports data and is a known limitation of the current logic.
- **Portfolio Performance file format**
  The script only supports the unencrypted XML (without IDs) file format of Portfolio Performance.

## 🛠️ Troubleshooting

- **Missing Data**: If a security is not classified, it might be because Morningstar does not have data for that specific ISIN, or the ISIN is missing in your Portfolio Performance file.
- **Rate Limiting**: If you have a very large portfolio, Morningstar might temporarily block requests. The script includes delays to mitigate this.
- **Invalid XML**: Ensure your input file is a valid Portfolio Performance XML file (unencrypted).

## 🖼️ Gallery

### Autoclassified stock-style

![Autoclassified stock-style](https://raw.githubusercontent.com/rylorin/pp-portfolio-classifier/refs/heads/main/docs/img/autoclassified-stock-style.png)

### Autoclassified Regions

![Autoclassified Regions](https://raw.githubusercontent.com/rylorin/pp-portfolio-classifier/refs/heads/main/docs/img/autoclassified-regions.png)

### Autoclassified Sectors

![Autoclassified Sectors](https://raw.githubusercontent.com/rylorin/pp-portfolio-classifier/refs/heads/main/docs/img/autoclassified-sectors.png)

### List of stocks and holdings from Top 10 of each fund

![List of stocks and holdings from Top 10 of each fund](https://raw.githubusercontent.com/rylorin/pp-portfolio-classifier/refs/heads/main/docs/img/top-10-holdings.png)

## ✨ Contributions

Contributions are welcome! Please submit a _pull request_ to
[rylorin/pp-portfolio-classifier](https://github.com/rylorin/pp-portfolio-classifier)
GitHub repository with your improvements.

## 📜 License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## 🙏 Credits & Contributors

Based on the original work by [Alfons1Qto12/pp-portfolio-classifier](https://github.com/Alfons1Qto12/pp-portfolio-classifier).
