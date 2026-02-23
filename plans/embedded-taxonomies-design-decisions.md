# Décisions de conception : Taxonomies Imbriquées

## 🤔 Question : Code vs Nom pour parentCategory

### Contexte

Dans la configuration `embeddedTaxonomies`, le champ `parentCategory` identifie la catégorie parent où imbriquer la taxonomie enfant.

**Deux approches possibles :**

1. **Utiliser le nom de la catégorie** (approche retenue)

   ```json
   {
     "parentCategory": "Stock"
   }
   ```

2. **Utiliser le code de la catégorie**
   ```json
   {
     "parentCategory": "1" // Code Morningstar pour Stock
   }
   ```

### Analyse comparative

| Critère                  | Nom (retenu)            | Code                                |
| ------------------------ | ----------------------- | ----------------------------------- |
| **Lisibilité**           | ✅ Excellent            | ❌ Nécessite de connaître les codes |
| **Robustesse**           | ⚠️ Dépend du mapping    | ✅ Indépendant du mapping           |
| **Flexibilité**          | ✅ Supporte mapping N→1 | ❌ Un seul code par catégorie       |
| **Maintenance**          | ✅ Facile à comprendre  | ❌ Nécessite documentation          |
| **Internationalisation** | ✅ Peut être traduit    | ✅ Universel                        |

### Cas d'usage : Mapping N→1

**Exemple avec le nom (approche retenue) :**

```json
{
  "mappings": {
    "AssetTypeMap": {
      "1": "Stock",
      "11": "Stock", // Autre code mappé vers Stock
      "3": "Bond"
    }
  },
  "embeddedTaxonomies": {
    "stock_style_in_asset": {
      "parentCategory": "Stock" // Couvre les codes 1 ET 11
    }
  }
}
```

**Avec le code :**

```json
{
  "embeddedTaxonomies": {
    "stock_style_in_asset": {
      "parentCategory": "1" // Ne couvre QUE le code 1
    }
  }
}
```

### Décision retenue : Utiliser le nom

**Raisons :**

1. **Lisibilité** : Plus facile à comprendre et maintenir
2. **Flexibilité** : Supporte les mappings N→1 (plusieurs codes → même nom)
3. **Cohérence** : Les assignments dans le XML utilisent déjà les noms
4. **Simplicité** : Pas besoin de connaître les codes Morningstar

**Inconvénient accepté :**

- Dépendance au mapping : Si le mapping change (ex: "Stock" → "Actions"), il faut aussi changer `parentCategory`

### Solution alternative pour robustesse (v2)

Pour une version future, on pourrait supporter les deux :

```json
{
  "embeddedTaxonomies": {
    "stock_style_in_asset": {
      "parentCategory": "Stock", // Nom (prioritaire)
      "parentCategoryCode": "1", // Code (fallback)
      "parentCategoryPattern": "Stock.*" // Regex (avancé)
    }
  }
}
```

**Logique de résolution :**

1. Chercher par nom exact
2. Si non trouvé, chercher par code
3. Si non trouvé, chercher par pattern

### Recommandation pour l'utilisateur

**Pour maximiser la robustesse :**

1. **Utiliser des noms stables** : Éviter de changer les noms de catégories fréquemment
2. **Documenter les mappings** : Garder une trace des codes → noms
3. **Tester après changement** : Si vous modifiez un mapping, vérifier les embedded taxonomies

**Exemple de bonne pratique :**

```json
{
  "// IMPORTANT: Ces noms sont utilisés dans embeddedTaxonomies": "",
  "// Ne pas modifier sans vérifier les références": "",

  "mappings": {
    "AssetTypeMap": {
      "1": "Stock", // ← Utilisé dans stock_style_in_asset
      "3": "Bond", // ← Utilisé dans bond_sector_in_asset
      "7": "Cash"
    }
  },

  "embeddedTaxonomies": {
    "stock_style_in_asset": {
      "parentCategory": "Stock" // Référence le nom ci-dessus
    }
  }
}
```

## 🔄 Évolution future : Support des deux approches

### Interface étendue (v2)

```typescript
interface EmbeddedTaxonomyConfig {
  active: boolean;
  parentTaxonomy: string;

  // Option 1: Par nom (actuel)
  parentCategory?: string;

  // Option 2: Par code (futur)
  parentCategoryCode?: string;

  // Option 3: Par pattern (futur)
  parentCategoryPattern?: string;

  childTaxonomy: string;
  targetTaxonomy: string;
}
```

### Algorithme de résolution (v2)

```typescript
function findParentCategory(
  assignments: TaxonomyAssignment[],
  config: EmbeddedTaxonomyConfig,
  mapping: Record<string, string>,
): TaxonomyAssignment | null {
  // 1. Chercher par nom (prioritaire)
  if (config.parentCategory) {
    const byName = assignments.find((a) => a.path.length === 1 && a.path[0] === config.parentCategory);
    if (byName) return byName;
  }

  // 2. Chercher par code (fallback)
  if (config.parentCategoryCode) {
    const categoryName = mapping[config.parentCategoryCode];
    if (categoryName) {
      const byCode = assignments.find((a) => a.path.length === 1 && a.path[0] === categoryName);
      if (byCode) return byCode;
    }
  }

  // 3. Chercher par pattern (avancé)
  if (config.parentCategoryPattern) {
    const regex = new RegExp(config.parentCategoryPattern);
    const byPattern = assignments.find((a) => a.path.length === 1 && regex.test(a.path[0]));
    if (byPattern) return byPattern;
  }

  return null;
}
```

## 📝 Notes pour l'implémentation

### Version 1 (actuelle)

- Utiliser uniquement `parentCategory` avec le nom
- Documenter clairement la dépendance au mapping
- Ajouter un warning si la catégorie n'est pas trouvée

### Version 2 (future)

- Ajouter support de `parentCategoryCode`
- Implémenter l'algorithme de résolution
- Maintenir la rétrocompatibilité

## ✅ Conclusion

**Décision finale : Utiliser le nom de la catégorie**

Cette approche offre le meilleur équilibre entre :

- Lisibilité et maintenabilité
- Flexibilité (mapping N→1)
- Simplicité d'utilisation

L'inconvénient de robustesse est acceptable car :

- Les mappings changent rarement
- La documentation claire mitigue le risque
- Une évolution future peut ajouter le support des codes

**Cette décision peut être revisitée dans une version future si le besoin se fait sentir.**
