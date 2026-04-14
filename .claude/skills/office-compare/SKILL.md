---
name: office-compare
description: Croise annonces bureau avec donnees publiques (DVF, SIRENE, BAN) pour scorer les opportunites
version: 1.0.0
agent: x-deep-office
triggers:
  - compare bureau
  - office compare
  - croiser annonces
  - scorer opportunites
  - enrichir bureaux
---

# Office Compare — Croisement annonces + data publique

Enrichit les resultats de `/office-search` avec les donnees publiques (DVF, SIRENE, BAN) pour noter chaque opportunite et detecter les bonnes affaires.

## Quand utiliser

- Apres un `/office-search` qui a genere un Excel
- Quand the user demande "compare", "score", "enrichir" les annonces
- Pour evaluer si un prix affiche est coherent avec le marche reel

## Inputs

- **Fichier Excel** : resultat de `/office-search` dans `realestate/BDD_Bureaux_*.xlsx`
- **OU** une liste d'annonces mentionnees dans la conversation
- **Filtres optionnels** : budget max, surface, nb postes

## Process

### Phase 1 — Charger les annonces

Lire le fichier Excel ou les annonces de la conversation. Pour chaque annonce, extraire :
- Adresse
- Surface m2
- Prix EUR/mois
- Type (bureau prive, opere, coworking)
- Operateur / Broker

### Phase 2 — Enrichir avec BAN (geocodage)

Pour chaque adresse unique, appeler `ban_geocode` :
- Normaliser l'adresse
- Obtenir lat/lon
- Obtenir code_insee (necessaire pour DVF)

**Paralleliser** les appels BAN (pas de rate limit strict).

### Phase 3 — Enrichir avec DVF (historique transactions)

Pour chaque code_insee unique, appeler `dvf_get_price_stats` :
- Obtenir le prix median au m2/an de la zone
- Type de bien : "Local industriel. commercial ou assimile" pour les bureaux

Pour les annonces les plus interessantes (top 20), appeler `dvf_building_history` :
- Historique des transactions du batiment specifique
- Dernier prix de vente connu

### Phase 4 — Enrichir avec SIRENE (occupant actuel)

Pour chaque adresse unique, appeler `sirene_search_by_address` :
- Identifier les entreprises enregistrees a cette adresse
- Detecter si le bureau est potentiellement vacant (entreprise radiee recemment)
- Enrichir avec taille entreprise, secteur d'activite

### Phase 5 — Scorer

Appliquer le modele de scoring (voir `realestate/scoring-model.md`) :

```
price_delta = prix_affiche_m2_an / prix_median_DVF_zone
score = (price_delta * 0.4) + (location * 0.3) + (value * 0.3)
```

Normaliser sur 100. Flagger les prix suspects.

### Phase 6 — Output

Generer un Excel enrichi dans `realestate/` avec les colonnes additionnelles :

| Colonne | Source |
|---------|--------|
| Adresse normalisee | BAN |
| Lat / Lon | BAN |
| Code INSEE | BAN |
| Prix median DVF zone (EUR/m2/an) | DVF |
| Nb transactions DVF zone | DVF |
| Dernier prix vente batiment | DVF building_history |
| Entreprises a l'adresse | SIRENE |
| Bureau potentiellement vacant | SIRENE (radiation recente) |
| Score opportunite (/100) | Scoring model |
| Flag | Prix a verifier, doublon, DVF manquant |

Nommage : `realestate/BDD_Bureaux_[Ville][Arr]_enrichi_[YYYY-MM-DD].xlsx`

### Phase 7 — Resume conversation

Presenter dans la conversation :
1. **Top 5 opportunites** (score > 80)
2. **Alertes** : prix suspects, bureaux potentiellement vacants
3. **Stats marche** : prix median DVF vs prix moyen annonces = surcote/decote globale

## Rate limits

- DVF : pas de limite documentee, respecter 1 req/sec
- SIRENE (recherche-entreprises) : 7 req/sec
- BAN : 50 req/sec

## Knowledge compilation

Apres chaque run, compiler les nouvelles donnees :
- Mettre a jour `realestate/market-paris.md` si nouvelles stats DVF
- Ajouter les operateurs decouverts dans `realestate/operators-map.md`
- Sauvegarder le raw dans `.agent/raw/` avec frontmatter type=observation
