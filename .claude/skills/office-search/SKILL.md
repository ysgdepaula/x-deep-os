---
name: office-search
description: Recherche exhaustive de bureaux dans un arrondissement donne — scrape, croise, deduplique, genere Excel
version: 1.0.0
agent: x-deep-office
triggers:
  - cherche bureau
  - recherche bureau
  - office search
  - bureaux disponibles
  - find offices
---

# Office Search — Recherche exhaustive de bureaux

> **Note**: this skill is written for the French commercial real estate market
> (Ubiq, BureauxLocaux, Geolocaux, BNP Paribas RE). To adapt to another country,
> replace the source list with local equivalents (LoopNet US, Rightmove UK,
> Zillow Commercial, etc.) and swap the API references (DVF/SIRENE/BAN) for your
> local cadastre/registry data.

Recherche, croise et consolide toutes les annonces de bureaux disponibles dans un arrondissement donne. Produit un fichier Excel nettoye et deduplique.

## Quand utiliser

- the user demande de chercher des bureaux dans un arrondissement
- Recherche d'espaces de coworking / bureaux operes
- Comparaison de prix / surfaces sur un secteur

## Inputs

L'utilisateur fournit :
- **Ville** (ex: Paris, your city, Bordeaux)
- **Arrondissement ou quartier** (ex: 9eme, Vaise, La Defense)
- **Filtres optionnels** : surface min/max, budget max, nb postes, type (coworking/bail/presta)

## Strategie de scraping (ordre de priorite)

### Phase 1 — WebSearch (5 sec)
Lancer 3 WebSearch en parallele pour cartographier les sources :
```
1. "location bureau [ville] [arrondissement] [annee]"
2. "coworking bureau prive [ville] [arrondissement] operateur disponible"
3. "bureau a louer [ville] [arrondissement] [top brokers]"
```
Objectif : identifier les URLs et estimer le volume d'annonces.

### Phase 2 — Scraping agent-browser (parallele, 3-5 agents)
Lancer un agent par source. Sources prioritaires :
1. **Ubiq.fr** — meilleure source petites surfaces / coworking / bureaux operes
2. **BureauxLocaux.com** — volume le plus large, toutes tailles
3. **Geolocaux.com** — bonne couverture brokers traditionnels
4. **BNP Paribas RE** — bnppre.fr, grandes surfaces
5. **MALSH Realty** — your city uniquement

#### Prompt type pour chaque agent :
```
Utilise le skill agent-browser pour naviguer sur [SOURCE] et trouver
TOUS les bureaux disponibles a la location dans le [ARRONDISSEMENT] de [VILLE].

URL de depart : [URL]

Pagine a travers TOUTES les pages. Pour chaque annonce extrais :
- Adresse
- Surface (m2) et surface minimum si divisible
- Nombre de postes
- Prix mensuel (EUR/mois)
- Prix au m2/an si disponible
- Type (bureau prive, coworking, open space, plateau, bureau opere)
- Type de contrat (bail, prestation de service, sous-location)
- OPERATEUR / GESTIONNAIRE de l'espace (Deskeo, Wojo, WeWork, Morning, Joro, Patchwork, proprio...)
- BROKER / AGENCE qui commercialise (Knight Frank, BNP, Cushman, Leaseo...)
- Lien de l'annonce

IMPORTANT : bien distinguer l'operateur (qui gere l'espace) du broker (qui le commercialise).
Un espace Deskeo commercialise par Newmark → operateur=Deskeo, broker=Newmark.

Donne un tableau recapitulatif complet.
```

### Phase 2 bis — Scraping operateurs (agent dedie)
Lancer un agent supplementaire pour extraire la LISTE DES OPERATEURS depuis Ubiq :
```
URL : https://www.ubiq.fr/location-bureau-[ville]-[code-postal]

L'objectif n'est PAS de relister les annonces mais d'extraire :
- Nom de chaque operateur/gestionnaire d'espace
- Nombre d'espaces dans l'arrondissement
- Adresses
- Fourchette de prix

Operateurs connus a detecter : Deskeo, WeWork, Wojo, Morning, Patchwork,
Regus, Spaces (IWG), Joro, MOZAIK, Glory Paris, SYMPHONY, Skillink,
Schoolab, SnapDesk, Comeandwork, Les Nouveaux Bureaux, Gecina, Nextdoor.
```
**Pourquoi un agent dedie :** dans la v1 on a rate Joro, MOZAIK, Patchwork, Glory Paris
et 15 autres operateurs parce que le prompt ne demandait pas cette dimension.

### Sources secondaires (si firecrawl dispo)
- JLL — immobilier.jll.fr
- CBRE — immobilier.cbre.fr
- Cushman & Wakefield — immobilier.cushmanwakefield.fr
- Knight Frank — knightfrank.fr
- Savills — savills.fr
- Arthur Loyd — arthur-loyd.com
- Deskeo — deskeo.com (operateur)
- Wojo — wojo.com (operateur)
- WeWork — wework.com (operateur, souvent bloque)
- Morning — morning.com (operateur)
- Hub-Grade — hub-grade.com
- Workin.space — workin.space

### Sources bloquees connues
- **SeLoger Bureau** : 403 systematique sur scraping
- **WeWork** : anti-bot agressif
- **LoopNet** : contenu limite sans compte

## Phase 3 — Consolidation et deduplication

### Regles de deduplication
Un doublon = meme adresse normalisee + surface identique (+/- 5%).
Quand doublon detecte :
- Garder l'entree avec le plus d'infos (prix, contrat, agence)
- Merger les sources dans la colonne "Sources"
- Garder le prix le plus recent

### Normalisation des prix
Certaines agences affichent le **prix/m2/an** au lieu du **loyer mensuel**. Signaux :
- Prix < 1000 EUR pour une surface > 100 m2 → probablement prix/m2/an
- Verifier la coherence : prix/mois ÷ surface × 12 ≈ prix/m2/an

Si incoherence detectee : marquer la ligne avec un flag "PRIX A VERIFIER".

### Normalisation des adresses
- Supprimer "75009", "69009", etc.
- Normaliser : "Fbg" → "Faubourg", "Bd" → "Boulevard", "Rue" → "Rue"
- Garder le format : "[Numero] [Type voie] [Nom]"

## Phase 4 — Generation Excel

Utiliser le script `realestate/generate_paris9_excel.py` comme template.

### Structure du fichier Excel

#### Sheet 1 : BDD Complete
Colonnes : #, Adresse, Surface m2, Surf. min, Postes, Prix EUR/mois, EUR/m2/an, Type, Contrat, **Operateur**, **Broker**, Sources, Lien, Flag

Couleurs :
- Bleu clair = Bureau opere (Deskeo, Wojo, WeWork, Joro...)
- Vert clair = Coworking / poste individuel
- Orange clair = Bail classique
- Rose clair = Sous-location
- Rouge clair = PRIX A VERIFIER (incoherence detectee)

Tri : operateurs d'abord (par prix), puis bureaux classiques. Filtres auto. Freeze row 1.

#### Sheet 2 : Operateurs
Liste de tous les operateurs avec nb espaces, adresses, fourchette prix.
Trie par nombre d'espaces decroissant.

#### Sheet 3 : Stats Marche
- Nombre total annonces
- Repartition par type / contrat
- Fourchettes de prix (classiques vs operes vs coworking)
- Nombre d'operateurs identifies
- Top brokers

#### Sheet 4 : Legende
- Code couleurs
- Distinction operateur vs broker
- Date de scraping + sources

### Controle qualite prix
Si prix_mois / surface * 12 diverge de plus de 50% du prix_m2_an affiche → flag "PRIX A VERIFIER".
Seuil de suspicion : prix < 1000 EUR/mois pour surface > 100 m2 → probablement prix/m2/an pas loyer mensuel.

### Nommage du fichier
`realestate/BDD_Bureaux_[Ville][Arrondissement]_[YYYY-MM-DD].xlsx`

## Optimisations de performance

1. **Toujours lancer les agents en parallele** — ne jamais scraper sequentiellement
2. **Ubiq en premier** — meilleure source pour les petits bureaux, souvent 3x plus d'annonces que les autres
3. **Ne pas oublier Ubiq** — erreur commise lors de la premiere recherche your city 9, corriger ici
4. **WebSearch comme pre-scan** — identifier les URLs avant de lancer les agents
5. **Cap a 5 agents simultanes** — au-dela, risque de timeout
6. **Si firecrawl dispo** — l'utiliser pour les sites qui bloquent Playwright
7. **Temps estime** : 10-15 min pour un arrondissement complet

## Output attendu

1. Fichier Excel dans `realestate/`
2. Resume dans la conversation :
   - Nombre total d'annonces
   - Top 10 les plus pertinentes selon les filtres de the user
   - Observations marche (prix moyen, quartiers premium, bonnes affaires)
3. Ouvrir le fichier : `open realestate/BDD_Bureaux_[...].xlsx`
