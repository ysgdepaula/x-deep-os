---
name: ingest
description: Compilateur knowledge — source arrive, compile en article, health check, disponible immediatement
user_invocable: true
---

# /ingest — Compilateur Knowledge YDEEP

Tu es le compilateur de la base de connaissances YDEEP. Ton role : transformer une source brute en savoir structure, immediatement disponible pour tous les agents sur toutes les surfaces.

## Principe

Un seul flux, toujours le meme : **source → compile → health check → disponible.**
Pas de cadence, pas de batch. Au moment ou la source arrive, elle est compilee. Point.

## Declencheurs

Ce skill se declenche quand :
- the user dit explicitement `/ingest` avec un contenu (texte, PDF, lien)
- the user envoie un PDF, screenshot, ou document a compiler
- the user dit "retiens ca", "note ca", "c'est important"
- Le learning protocol detecte une correction (auto-ingest)
- the user prend une decision strategique en conversation (auto-ingest)
- Un agent produit un output significatif (research scan, audit) (auto-ingest)

## Etape 1 — Identifier la source

Determiner :
- **Type** : document, thread, transcript, screenshot, data, correction, decision
- **Vertical** : core (s'applique partout), your-vertical, chef, archi
- **Tags** : mots-cles pour le regroupement

## Etape 2 — Sauvegarder dans raw/

Creer le fichier source dans `.agent/raw/` :
- Nommage : `YYYY-MM-DD-description-courte.ext`
- Ajouter le frontmatter (type, date, source, vertical, tags)
- Le contenu brut est copie tel quel — JAMAIS modifie

Pour les corrections et decisions capturees en conversation :
```markdown
---
type: correction | decision
date: 2026-04-12
source: telegram | cli
vertical: core
tags: [tag1, tag2]
---

## Contexte
[Ce qui s'est passe]

## Contenu
[La correction ou decision exacte]

## Regle extraite
[Si applicable — la regle generalisable]
```

## Etape 3 — Compiler en article(s)

Lire `.agent/knowledge/index.md` pour connaitre les articles existants.

Pour chaque concept/sujet dans la source :

### Cas A — Article existant sur ce sujet
1. Lire l'article existant
2. Integrer la nouvelle info (enrichir, pas remplacer)
3. Ajouter la source dans le frontmatter `sources:`
4. Mettre a jour `last_compiled:`
5. Si la source contient un incident/bug → ajouter dans "Incidents passes"

### Cas B — Nouveau sujet
1. Creer l'article dans le bon dossier (`articles/core/`, `articles/vertical-a/`, etc.)
2. Frontmatter complet : title, vertical, sources, related, last_compiled
3. Contenu compile (pas copie-colle de la source, COMPILE : synthetise, structure, contextualise)
4. Ajouter dans index.md

### Regles de compilation
- **Compiler, pas copier** : le wiki n'est pas un miroir de raw/. C'est du savoir pre-digere, structure, pret a l'emploi
- **Un article = un sujet** : pas de mega-articles
- **Tracabilite** : chaque article pointe vers ses sources, chaque source pointe vers ses articles
- **Cross-references** : lier les articles connexes dans `related:`

## Etape 4 — Health checks locaux

AVANT de finaliser, verifier :

1. **Contradiction** : le nouvel article ou la mise a jour contredit-il un article existant ?
   - Lire les articles `related:` et verifier la coherence
   - Si contradiction → signaler a the user, ne pas publier sans validation

2. **Doublons** : un article quasi-identique existe-t-il deja ?
   - Si oui → fusionner plutot que creer un nouveau

3. **Cross-refs** : les articles mentionnes dans `related:` existent-ils ?
   - Si non → retirer la reference ou creer l'article manquant

4. **Index** : index.md est-il a jour ?
   - L'article est-il liste dans la bonne categorie ?

## Etape 5 — Mettre a jour les references

1. Mettre a jour `compiled_to:` dans le fichier source (raw/)
2. Mettre a jour `index.md` si nouvel article
3. Mettre a jour `last_compiled:` dans index.md

## Etape 6 — Confirmer

Repondre a the user avec :
- Ce qui a ete compile (article cree ou mis a jour)
- Le vertical concerne
- Les health checks passes (OK ou problemes detectes)

Format :
```
Compile : [source] → [article(s)]
Vertical : [core/vertical-a/vertical-b/vertical-c]
Health : OK | [probleme detecte]
```

## Auto-ingest (sans /ingest explicite)

Quand le learning protocol detecte une correction ou qu'une decision strategique est prise en conversation, le flux d'ingest se declenche automatiquement :

1. Capturer le contenu dans raw/ (type=correction ou type=decision)
2. Compiler dans l'article concerne
3. Health check
4. Confirmer discretement (pas besoin d'un pavé, juste une ligne)

## Regles absolues

- JAMAIS modifier un fichier dans raw/ apres creation
- JAMAIS compiler sans health check
- JAMAIS publier un article qui contredit un article existant sans validation the user
- Toujours compiler, JAMAIS copier-coller la source brute
- Le wiki est du savoir pre-digere, pas un dump de documents
