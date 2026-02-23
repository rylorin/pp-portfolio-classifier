# Exemples de configuration : Taxonomies Imbriquées

## 📋 Configuration de base

### Structure dans config/default.json ou config/local.json

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

## 🎯 Exemple 1 : Fonds équilibré (80/20)

### Données source Morningstar

**Asset Type :**

- Stock : 80%
- Bond : 20%

**Stock Style :**

- Large Growth : 40%
- Large Value : 30%
- Mid Blend : 20%
- Small Value : 10%

**Bond Sector :**

- Government : 60%
- Corporate : 40%

### Résultat SANS embedded taxonomies

Trois taxonomies séparées :

**Taxonomie "Asset Type" :**

```
├── Stock : 80%
└── Bond : 20%
```

**Taxonomie "Stock Style" :**

```
├── Large Growth : 40%
├── Large Value : 30%
├── Mid Blend : 20%
└── Small Value : 10%
```

**Taxonomie "Bond Sector" :**

```
├── Government : 60%
└── Corporate : 40%
```

### Résultat AVEC embedded taxonomies

**Taxonomie "Asset Type" (enrichie) :**

```
├── Stock (80%)
│   ├── Large Growth : 32%  (80% × 40%)
│   ├── Large Value : 24%   (80% × 30%)
│   ├── Mid Blend : 16%     (80% × 20%)
│   └── Small Value : 8%    (80% × 10%)
└── Bond (20%)
    ├── Government : 12%    (20% × 60%)
    └── Corporate : 8%      (20% × 40%)
```

**Total : 32% + 24% + 16% + 8% + 12% + 8% = 100% ✓**

Les taxonomies "Stock Style" et "Bond Sector" restent inchangées.

## 🎯 Exemple 2 : Fonds 100% actions

### Données source

**Asset Type :**

- Stock : 100%

**Stock Style :**

- Large Growth : 70%
- Small Value : 30%

**Bond Sector :**

- (aucune donnée)

### Résultat avec embedded taxonomies

**Taxonomie "Asset Type" :**

```
└── Stock (100%)
    ├── Large Growth : 70%  (100% × 70%)
    └── Small Value : 30%   (100% × 30%)
```

**Note :** `bond_sector` n'est pas appliqué car il n'y a pas de catégorie "Bond" dans asset_type.

## 🎯 Exemple 3 : Fonds sans données Stock Style

### Données source

**Asset Type :**

- Stock : 80%
- Bond : 20%

**Stock Style :**

- (aucune donnée disponible)

**Bond Sector :**

- Government : 100%

### Résultat avec embedded taxonomies

**Taxonomie "Asset Type" :**

```
├── Stock : 80%             (garde l'original car pas de stock_style)
└── Bond (20%)
    └── Government : 20%    (20% × 100%)
```

**Note :** Si une taxonomie enfant n'a pas de données, la catégorie parent reste telle quelle.

## 🎯 Exemple 4 : Votre cas d'usage

### Configuration recommandée

```json
{
  "mappings": {
    "AssetTypeMap": {
      "1": "Stock",
      "3": "Bond",
      "7": "Cash",
      "8": "Other"
    }
  },

  "taxonomies": {
    "asset_type": {
      "active": true,
      "name": "Classes d'actifs",
      "sourcePath": "Portfolios[0].AssetAllocations",
      "keyField": "Type",
      "valueField": "Value",
      "filter": { "Type": "MorningStarDefault", "SalePosition": "N" },
      "mapping": "AssetTypeMap",
      "fixTotal": true
    },

    "stock_style": {
      "active": true,
      "name": "Style d'actions",
      "sourcePath": "Portfolios[0].StyleBoxBreakdown",
      "keyField": "Type",
      "valueField": "Value",
      "filter": { "SalePosition": "N" },
      "mapping": "StockStyleBoxMap",
      "fixTotal": true
    },

    "bond_sector": {
      "active": true,
      "name": "Secteur obligataire",
      "sourcePath": "Portfolios[0].GlobalBondSectorBreakdownLevel2",
      "keyField": "Type",
      "valueField": "Value",
      "filter": { "SalePosition": "N" },
      "mapping": "BondSectorL2Map",
      "fixTotal": true
    }
  },

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

### Résultat attendu pour votre fonds

**Données source :**

- Asset Type : 80% Stock, 20% Bond
- Stock Style : 70% Large Growth, 30% Small Value
- Bond Sector : (données disponibles)

**Résultat dans Portfolio Performance :**

```
Classes d'actifs
├── Stock (80%)
│   ├── Large Growth : 56%
│   └── Small Value : 24%
└── Bond : 20%
```

**Total : 56% + 24% + 20% = 100% ✓**

## 📊 Représentation XML

### Structure XML générée

```xml
<taxonomy>
  <id>uuid-asset-type</id>
  <name>Classes d'actifs</name>
  <root>
    <id>uuid-root</id>
    <name>Classes d'actifs</name>
    <color>#89afee</color>
    <children>
      <!-- Catégorie Stock avec sous-catégories -->
      <classification>
        <id>uuid-stock</id>
        <name>Stock</name>
        <color>#89afee</color>
        <parent reference="../../../.."/>
        <children>
          <!-- Sous-catégorie Large Growth -->
          <classification>
            <id>uuid-large-growth</id>
            <name>Large Growth</name>
            <color>#89afee</color>
            <parent reference="../../../.."/>
            <assignments>
              <assignment>
                <investmentVehicle class="security" reference="../../../../../../securities/security[1]"/>
                <weight>5600</weight>
                <rank>0</rank>
              </assignment>
            </assignments>
          </classification>

          <!-- Sous-catégorie Small Value -->
          <classification>
            <id>uuid-small-value</id>
            <name>Small Value</name>
            <color>#89afee</color>
            <parent reference="../../../.."/>
            <assignments>
              <assignment>
                <investmentVehicle class="security" reference="../../../../../../securities/security[1]"/>
                <weight>2400</weight>
                <rank>0</rank>
              </assignment>
            </assignments>
          </classification>
        </children>
      </classification>

      <!-- Catégorie Bond -->
      <classification>
        <id>uuid-bond</id>
        <name>Bond</name>
        <color>#89afee</color>
        <parent reference="../../../.."/>
        <assignments>
          <assignment>
            <investmentVehicle class="security" reference="../../../../../../securities/security[1]"/>
            <weight>2000</weight>
            <rank>0</rank>
          </assignment>
        </assignments>
      </classification>
    </children>
  </root>
</taxonomy>
```

## 🔍 Cas particuliers

### Cas 1 : Arrondis

**Problème :** Avec les arrondis, le total peut dépasser 100%

**Exemple :**

- Stock : 33.33%
- Stock Style : 33.33% Large Growth, 33.33% Large Value, 33.34% Mid Blend

**Calcul :**

- Large Growth : 33.33% × 33.33% = 11.11%
- Large Value : 33.33% × 33.33% = 11.11%
- Mid Blend : 33.33% × 33.34% = 11.11%

**Solution :** Utiliser la fonction `fixTotalPercentage()` existante pour ajuster.

### Cas 2 : Catégorie parent avec 0%

**Exemple :**

- Stock : 0%
- Bond : 100%

**Résultat :** `stock_style` n'est pas appliqué, seul `bond_sector` est imbriqué.

### Cas 3 : Multiples niveaux (futur)

**Non supporté dans la v1, mais possible dans le futur :**

```
Asset Type
└── Stock
    └── Technology
        └── Software
```

## 🎨 Visualisation dans Portfolio Performance

### Vue "Allocation d'actifs"

Avec embedded taxonomies activées, vous verrez :

```
📊 Classes d'actifs
├─ 📈 Stock (80%)
│  ├─ 🔷 Large Growth (56%)
│  └─ 🔶 Small Value (24%)
└─ 📉 Bond (20%)
```

### Vue "Graphique"

Le graphique en secteurs montrera les sous-catégories avec les bonnes pondérations.

## ✅ Validation

### Checklist de validation

- [ ] Le total fait toujours 100%
- [ ] Les pondérations sont correctement calculées (parent × enfant)
- [ ] Les catégories sans enfants restent telles quelles
- [ ] Les taxonomies non-embedded fonctionnent normalement
- [ ] Le XML est valide et lisible par Portfolio Performance

### Tests recommandés

1. **Fonds équilibré** : 60/40 Stock/Bond
2. **Fonds 100% actions** : Vérifier que bond_sector n'est pas appliqué
3. **Fonds 100% obligations** : Vérifier que stock_style n'est pas appliqué
4. **Fonds sans données style** : Vérifier que la catégorie parent reste intacte
5. **Fonds multi-actifs complexe** : 50% Stock, 30% Bond, 20% Cash

## 🚀 Migration depuis la version actuelle

### Étape 1 : Sauvegarder votre configuration

Copiez votre `config/local.json` actuel.

### Étape 2 : Ajouter la section embeddedTaxonomies

```json
{
  "embeddedTaxonomies": {
    "stock_style_in_asset": {
      "active": false
    }
  }
}
```

### Étape 3 : Tester avec embedded désactivé

Vérifiez que tout fonctionne comme avant.

### Étape 4 : Activer progressivement

Activez d'abord `stock_style_in_asset`, testez, puis `bond_sector_in_asset`.

### Étape 5 : Valider les résultats

Comparez les pondérations dans Portfolio Performance.
