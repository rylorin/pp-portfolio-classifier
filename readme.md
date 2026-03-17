# 🤖 Portfolio Performance Classifier

![Version](https://img.shields.io/github/package-json/v/rylorin/pp-portfolio-classifier)
[![Publish](https://github.com/rylorin/pp-portfolio-classifier/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/rylorin/pp-portfolio-classifier/actions/workflows/npm-publish.yml)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Downloads](https://img.shields.io/npm/dt/pp-portfolio-classifier.svg)

This project is an automation tool for [Portfolio Performance](https://www.portfolio-performance.info/). It automatically classifies your securities (Funds, ETFs, Stocks) by retrieving data from Morningstar.

It is a **TypeScript** adaptation and rewrite of the Python project [Alfons1Qto12/pp-portfolio-classifier](https://github.com/Alfons1Qto12/pp-portfolio-classifier).

## 🌟 Features

- **Multi-Type Support**: Handles Funds/ETFs as well as Stocks.
- **Automatic Taxonomies**: Creates and updates classifications in your XML file:
  - Asset Allocation (Equity, Bond, Cash, etc.)
  - Regions (Americas, Europe, Asia, etc.)
  - Sectors (Technology, Healthcare, Finance, etc.)
- **Non-destructive**: Generates a new XML file by default to avoid overwriting your data without verification.
- **Configurable**: Customize the script's behavior (language, taxonomies, etc.) via a configuration file.
- **Multi-levels taxonomies**: Supports hierarchical taxonomies (e.g., "Europe > Germany").
- **Nested taxonomies**: Allows to embed a taxonomy into a specific category of another taxonomy.

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

To run the classification on your portfolio file from the command line prompt, use the following command:

```bash
npx pp-portfolio-classifier <path_to_your_portfolio.xml> [output_path.xml]
```

- **Input** - The path to your current Portfolio Performance `.xml` file.

- **Output** (Optional): The path to save the modified file. Default: input file with suffix `.classified.xml`.

## ⚙️ Configuration

The project uses `node-config` for configuration management.

### Customization (Language and Taxonomies)

You can customize the script's behavior (change the taxonomy language, modify the Morningstar domain, etc.) by creating a `config/local.json` file. This file will override the default values ​​defined in `config/default.json`. The custom config file (`config/local.json`) can be located in the same directory as your portfolio file or in the current working directory.

This is ideal for adapting category names to your language or customize taxonomies to your personal preferences.

**Example of `config/local.json`:**

```json
{
  "mappings": {
    "AssetTypeMap": {
      "1": "Actions",
      "3": "Obligations",
      "5": "Obligations",
      "6": "Obligations",
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
        "value": "Actions"
      }
    },
    "region": { "active": false },
    "country": { "active": false },
    "country_by_region": { "active": true },
    "stock_style": { "active": false },
    "stock_sector": { "active": true },
    "bond_sector": { "active": false },
    "holding": { "active": false }
  },
  "embeddedTaxonomies": {
    "stock_style_in_asset": {
      "active": true,
      "parentCategory": "Actions"
    },
    "bond_sector_in_asset": {
      "active": true,
      "parentCategory": "Obligations"
    }
  }
}
```

**Available Taxonomies:**

- `asset_type` **enabled by default**
- `region` **enabled if the taxonomy already exists in your portfolio file**
- `country` **enabled if the taxonomy already exists in your portfolio file**
- `country_by_region` **enabled by default**
- `stock_style` **enabled if the taxonomy already exists in your portfolio file**
- `stock_sector` **enabled by default**
- `bond_sector` **enabled if the taxonomy already exists in your portfolio file**
- `holding` **disabled by default** as the taxonomy may become huge and difficult to manage for PP.

**Configuration fields:**

- `active`: Enable/disable this taxonomy. Set to `true` to enable, `false` to disable, or `"auto"` to enable it only if the taxonomy already exists in your portfolio file.
- `name`: The name of the taxonomy as it will appear in Portfolio Performance.
- `mapping`: The key of the mapping table to use for this taxonomy.
- `filter`: 
- `multigroup`: If `true`, containers with multiple groups will be included in the taxonomy. If `false`, only the first group in the container will be included. Default is `false`.
- `inclNotClassified`: In multi-asset fund breakdowns, Morningstar reports the weights as a percentage of the classified fraction of the fund. Set this to `true`to rescale the weights to the percentage of the total fund composition by multiplying the weights with `(1 - NotClassified/100)`. Default is `false` to keep behaviour consistent with pre-existing json configuration files.
- `stockConfig`: Specific configuration for stocks.

### How Mappings Work

The classification logic relies on mapping tables defined in the configuration files (config/default.json and config/local.json) to translate Morningstar data into your Portfolio Performance taxonomies.

- Direct Value: For some taxonomies like holding, no mapping table is used. The script directly uses the value provided by Morningstar (e.g., the security name).
- Mapped Value: For most taxonomies, a mapping table is used to convert a code or an ID from Morningstar into a human-readable category name. For instance, AssetTypeMap converts the code 1 to "Stock". If a code is mapped to `null`, that specific data point is ignored. This is crucial for avoiding inconsistencies. For example, the region breakdown from Morningstar includes both geographical regions (like "Europe", "Asia") and market types ("Developed Markets", "Emerging Markets"). Without ignoring the market types, the total allocation would exceed 100%. By mapping them to `null`, we ensure only the geographical regions are used for the classification.

### Advanced Usage: Security Notes Flags

You can control the classification behavior for specific securities by adding special flags to the **Note** field in Portfolio Performance.

- **Override ISIN**: Use a different ISIN for Morningstar lookup (useful if the security's main ISIN is not found or incorrect in Morningstar).
  `#PPC:[ISIN2=US0000000000]`

- **Ignore Classification**: Prevent the script from classifying a specific security.
  - Ignore all taxonomies: `#PPC:[ignore]`
  - Ignore specific taxonomies (comma separated): `#PPC:[ignore=asset_type,region]`

## ⚠️ Known Limitations

- **Portfolio Performance file format**
  The script only supports the unencrypted XML (without IDs) file format of Portfolio Performance.

## Multi-Asset Fund Breakdowns
Unless configured correctly, the tool may produce inconsistent classifications for funds holding multiple asset classes (e.g., 90% Stocks, 10% Bonds).
Morningstar reports a breakdown relative to a specific asset class (e.g., "100% of Bonds are Government Bonds"), therefore this percentage will apply to the **entire fund** instead of weighting it by the asset class portion (i.e., 100% of the 10%).
This means a fund with only 10% bonds could be classified as 100% Government Bonds in that specific taxonomy. 📌This issue can be addressed either with configuration options or by using nested taxonomies.

## Configuration for Multi-Asset Funds

### Examples
As an example, the Country Exposure response for a fund containing 65% stocks (of which 80% USA and 20% Germany) and 35 % bonds (of which 70% France and 30% USA) might look like this (here, only the net sales positions are shown, not the long and short positions):
``` json
[
  {
    "Portfolios": [
      {
        "CountryExposure": [
          {
            "NotClassified": 35,
            "SalePosition": "N",
            "Type": "Equity",
            "BreakdownValues": [
              {
                "Value": 20,
                "Type": "DEU"
              },
              {
                "Value": 80,
                "Type": "USA"
              }
            ]
          },
          {
            "NotClassified": 65,
            "SalePosition": "N",
            "Type": "Bond",
            "BreakdownValues": [
              {
                "Value": 70,
                "Type": "FRA"
              },
              {
                "Value": 30,
                "Type": "USA"
              }
            ]
          }
        ]
      }
    ]
  }
]
```
Let's look at the results with different configurations:

**Report bond breakdown as percentage of bonds**
Config:
``` json
"filter": { "SalePosition": "N", "Type": "Bond"},
"multigroup": false,
"inclNotClassified": false
```

Result:
```text
Country:
├── FRA 70
└── USA 30
```
**Report equity breakdown as percentage of total fund**
Config:
``` json
"filter": { "SalePosition": "N", "Type": "Equity"},
"multigroup": false,
"inclNotClassified": true
```

Result:
```text
Country:
├── DEU 13 ← 20 * (1 - 35/100)
└── USA 52 ← 80 * (1 - 35/100)
```
**Report total breakdown as percentage of total fund**
Config:
``` json
"filter": { "SalePosition": "N"},
"multigroup": true,
"inclNotClassified": true
```

Result:
```text
Country:
├── DEU 13 ← 20 * (1 - 35/100)
└── USA 62.5 ← 80 * (1 - 35/100) + 30 * (1 - 65/100)
└── FRA 24.5 ← 70 * (1 - 65/100)
```
Note that in the last example the Type filter was removed and multigroup was set to `true` to process both stocks and bonds, each with their respective weighting of `(1 - NotClassified/100)`.

## 🔗 Nested Taxonomies

You can now nest taxonomies within specific categories of other taxonomies! This solves the multi-asset fund limitation mentioned above.

### How it works

Instead of having separate taxonomies, you can embed one taxonomy into a specific category of another taxonomy. The weights are automatically calculated in cascade.

### Example

**Without embedded taxonomies:**

```text
Asset Type:          Stock Style:
├── Stock: 80%       ├── Large Growth: 70%
└── Bond: 20%        └── Small Value: 30%
```

**With embedded taxonomies:**

```text
Asset Type:
├── Stock (80%)
│   ├── Large Growth: 56%  ← 80% × 70%
│   └── Small Value: 24%  ← 80% × 30%
└── Bond: 20%
```

### Configuration

Add an `embeddedTaxonomies` section to your `config/local.json`:

```json
{
  "embeddedTaxonomies": {
    "stock_style_in_asset": {
      "active": true,
      "parentTaxonomy": "asset_type",
      "parentCategory": "Stock",
      "childTaxonomy": "stock_style",
      "targetTaxonomy": "asset_type"
    },
    "bond_sector_in_asset": {
      "active": true,
      "parentTaxonomy": "asset_type",
      "parentCategory": "Bond",
      "childTaxonomy": "bond_sector",
      "targetTaxonomy": "asset_type"
    }
  }
}
```

> The above example is already included in the default configuration but is provided here for reference/documentation.

**Configuration fields:**

- `active`: Enable/disable this embedding
- `parentTaxonomy`: The taxonomy containing the parent category
- `parentCategory`: The category where to embed the child taxonomy
- `childTaxonomy`: The taxonomy to embed
- `targetTaxonomy`: The taxonomy where to create subcategories (usually same as parentTaxonomy)

### Use Cases

1. **Multi-asset funds**: Embed stock styles within stocks, bond sectors within bonds
2. **Detailed breakdowns**: Get more granular classifications for specific asset classes
3. **Better visualization**: See the complete hierarchy in a single taxonomy

### Notes

- Embedded taxonomies are **enabled by default** as they provide a more accurate classification.
- The total always equals 100% (automatic adjustment if needed)
- If a parent category doesn't exist (0%), the embedding is skipped
- If a child taxonomy has no data, the parent category remains unchanged

## 🛠️ Troubleshooting

- **Missing Data**: If a security is not classified, it might be because Morningstar does not have data for that specific ISIN, or the ISIN is missing in your Portfolio Performance file.
- **Rate Limiting**: If you have a very large portfolio, Morningstar might temporarily block requests. The script includes delays to mitigate this.
- **Invalid XML**: Ensure your input file is a valid Portfolio Performance XML file (unencrypted).

## 🖼️ Gallery

### Asset Type (nested taxonomies)

![Asset Type with nested taxonomies](https://raw.githubusercontent.com/rylorin/pp-portfolio-classifier/refs/heads/main/docs/img/embeded-taxonomies.png)

### Regions (hierachical taxonomy)

![Autoclassified Regions](https://raw.githubusercontent.com/rylorin/pp-portfolio-classifier/refs/heads/main/docs/img/autoclassified-regions.png)

### Autoclassified stock-style

![Autoclassified stock-style](https://raw.githubusercontent.com/rylorin/pp-portfolio-classifier/refs/heads/main/docs/img/autoclassified-stock-style.png)

### Autoclassified Sectors

![Autoclassified Sectors](https://raw.githubusercontent.com/rylorin/pp-portfolio-classifier/refs/heads/main/docs/img/autoclassified-sectors.png)

### List of stocks and holdings

![List of stocks and holdings from Top 10 of each fund](https://raw.githubusercontent.com/rylorin/pp-portfolio-classifier/refs/heads/main/docs/img/top-10-holdings.png)

## ✨ Contributions

Contributions are welcome! Please submit a _pull request_ to
[rylorin/pp-portfolio-classifier](https://github.com/rylorin/pp-portfolio-classifier)
GitHub repository with your improvements.

## 📜 License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## 🙏 Credits & Contributors

- Based on the original work by [Alfons1Qto12/pp-portfolio-classifier](https://github.com/Alfons1Qto12/pp-portfolio-classifier).
- [Google Gemini](https://gemini.google.com/)
- [Kilo Code](https://kilo.ai)
