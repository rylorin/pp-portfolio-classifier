# Portfolio Performance Classifier (TypeScript)

This project is an automation tool for [Portfolio Performance](https://www.portfolio-performance.info/). It automatically classifies your securities (Funds, ETFs, Stocks) by retrieving data from Morningstar.

It is a **TypeScript** adaptation and rewrite of the Python project [Alfons1Qto12/pp-portfolio-classifier](https://github.com/Alfons1Qto12/pp-portfolio-classifier), offering better maintainability, strong typing, and configuration flexibility.

## Features

- **Multi-Type Support**: Handles Funds/ETFs as well as Stocks (via Morningstar SAL API).
- **Automatic Taxonomies**: Creates and updates classifications in your XML file:
  - Asset Allocation (Equity, Bond, Cash, etc.)
  - Regions (Americas, Europe, Asia, etc.)
  - Sectors (Technology, Healthcare, Finance, etc.)
- **Non-destructive**: Generates a new XML file by default to avoid overwriting your data without verification.

## Prerequisites

- [Node.js](https://nodejs.org/) (v22 or higher recommended)
- yarn or npm

## Installation

1. Clone this repository.
2. Install dependencies:

```bash
yarn
```

## Configuration

The project uses `node-config` for configuration management.

### Customization (Language and Taxonomies)

You can customize the script's behavior (change the taxonomy language, modify the Morningstar domain, etc.) by creating a `config/local.json` file. This file will override the default values ​​defined in `config/default.json`.

This is ideal for adapting category names to your language or personal preferences.

**Example of `config/local.json`:**

```json
{
  "mappings": {
    "AssetTypeMap": {
      "1": "Actions",
      "3": "Obligations",
      "5": "Préférentielles",
      "7": "Liquidités",
      "8": "Autres",
      "99": "Autres"
    }
  }
}
```

## Usage

To run the classification on your portfolio file:

```bash
npm start -- <path_to_your_portfolio.xml> [output_path.xml]

```

- **Input** - The path to your current Portfolio Performance `.xml` file.

- **Output** (Optional): The path to save the modified file. Default: `pp_classified_ts.xml`.

## Warning

Although this script takes care not to corrupt XML files, **always back up your Portfolio Performance file** before using it.

## License

This project is licensed under the MIT License.
See the [LICENSE](LICENSE) file for details.
