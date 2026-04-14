---
name: weekly-digest
description: Compile the week's intel scans into a synthesis with top opportunities and concrete improvement plans
user_invocable: true
triggers:
  - weekly digest
  - compile weekly digest
  - weekly research synthesis
---

# /weekly-digest — Compile the week into a synthesis

Synthesize the week's research-scan outputs and produce concrete improvement plans.
Owned by the `xdeep-research` agent.

## Declenchement

- Trigger remote : dimanche 3h du matin (cron `0 3 * * 0`)
- Ou manuellement via `/weekly-digest`

## Etape 1 — Synthese des digests

1. Lis `.agent/research-digest.md` — recupere les entrees des 7 derniers jours
2. Regroupe les trouvailles par theme :
   - Architecture agent / orchestration
   - Nouveaux outils / frameworks
   - MCP ecosystem
   - Autonomie / self-improvement
   - Evals / qualite
3. Identifie les **3 opportunites les plus prometteuses** (impact x faisabilite)

## Etape 2 — Deep-dive sur les top 3

Pour chaque opportunite :

1. **WebSearch approfondi** — chercher des exemples concrets, implementations, retours d'experience
2. **Analyse d'applicabilite** — comment ca s'applique a X-DEEP ? Quel agent en beneficie ?
3. **Effort vs impact** :
   - Effort : faible (<30 min) / moyen (1-3h) / lourd (>3h)
   - Impact : faible (confort) / moyen (efficacite) / fort (nouvelle capability)

## Etape 3 — Plans d'amelioration

Pour chaque opportunite retenue, rediger un mini-plan au format atomic-run :

```
### Opportunite : [titre]

**Contexte** : [pourquoi c'est pertinent pour X-DEEP]
**Source** : [lien vers la trouvaille]
**Agent concerne** : [quel sous-agent en beneficie]

### Task 1 : [action]
[details]

### Task 2 : [action]
[details]

**Effort total** : [estimation]
**Impact attendu** : [description concrete]
```

## Format de sortie

Sauvegarder dans `.agent/weekly-research-[date].md` :

```
# Weekly Deep Research — [date YYYY-MM-DD]

## Synthese de la semaine
- Scans effectues : [nb]
- Trouvailles totales : [nb]
- Themes dominants : [liste]

## Top 3 Opportunites

### 1. [Titre]
Score impact x faisabilite : [H/M/L] x [H/M/L]
[Deep-dive + plan atomic-run]

### 2. [Titre]
...

### 3. [Titre]
...

## Actions proposees
- [ ] [action 1] — effort: [F/M/L] — impact: [F/M/L]
- [ ] [action 2] — ...
```

Ajouter les actions dans `.agent/queue.md` avec tag `[weekly-research]`.

## Regles

- Max 3 opportunites — qualite > quantite
- Chaque plan doit etre executable en autonomie (format atomic-run)
- Ne pas implementer — seulement planifier et proposer
- Si aucun digest de la semaine → faire un scan frais (appeler /research-scan d'abord)
- Budget : max 20 min de recherche web
