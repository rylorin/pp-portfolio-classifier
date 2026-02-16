# Blueprint: Migration Portfolio Classifier (Python -> TypeScript)

## Objectif

Convertir le script de classification automatique pour Portfolio Performance en TypeScript/Node.js pour améliorer la maintenabilité, la performance et la configurabilité.

## Architecture

- **Language**: TypeScript (Node.js)
- **Config**: `node-config` (fichiers JSON/YAML externes pour les mappings)
- **XML**: `fast-xml-parser` (Lecture/Écriture en préservant les attributs)
- **HTTP**: `axios` (Gestion des requêtes et des headers)

## Étapes du POC (Proof of Concept)

1. [x] Structure du projet (package.json, tsconfig)
2. [x] Configuration externe (mappings Morningstar -> Taxonomies PP)
3. [x] Module API Morningstar (Token + Fetch Data optimisé)
4. [x] Module XML (Lecture + Sauvegarde compatible PP)
5. [x] Logique de Classification (Mapping des données API vers la structure XML)
6. [x] Gestion des "Titres vifs" (Stocks) vs Fonds
7. [x] Support des taxonomies à profondeur variable

## Optimisations vs Python

- **Appels API**: Le script Python fait 1 appel par taxonomie par titre. Le script TS fera 1 appel par titre et distribuera les données.
- **Typage**: Utilisation d'interfaces TS pour sécuriser la manipulation des objets XML complexes.
- **Flexible**: La configuration externe permet de modifier les mappings sans toucher au code.
