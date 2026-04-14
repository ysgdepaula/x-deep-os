# Protocole d'Apprentissage — YDEEP

> Chaque correction de the user est une opportunite d'apprendre. Ce protocole capture le delta et le transforme en regle.

## Quand ce protocole s'applique

### Signaux explicites
- the user modifie un draft avant de l'approuver (email, message, post)
- the user rejette une proposition et explique pourquoi
- the user corrige une action d'un sous-agent
- the user donne un feedback explicite ("non pas comme ca", "toujours faire X")

### Signaux implicites (CRITIQUE — souvent rates)
- the user corrige un comportement 2x → **save obligatoire**, meme sans "retiens ca"
- the user repond negativement ("nope", "non", "pk ?", "ca marche pas") → analyser ce qui a rate
- the user utilise un outil/workflow specifique (navigateur, editeur, terminal) → capturer la preference
- the user reformule une commande que YDEEP avait mal formulee → capturer la bonne version
- the user ignore une suggestion et fait autrement → noter son approche preferee
- the user montre de la friction (doit repeter, doit expliquer) → c'est un signal d'apprentissage

### Regle d'or
**Si the user corrige la meme chose 2 fois dans une session = echec du learning protocol.**
La premiere correction doit suffire. Sauvegarder en memoire immediatement.

## Flow de capture

```
Sous-agent produit un output
        │
        ▼
  the user modifie ou rejette
        │
        ▼
  YDEEP detecte le delta :
    - Original : ce que l'agent a produit
    - Final : ce que the user a valide/corrige
    - Delta : la difference
        │
        ▼
  Extraction du pattern :
    - Qu'est-ce qui a change ? (ton, contenu, format, destinataire...)
    - Pourquoi ? (demander a the user si pas evident)
    - Est-ce generalizable ? (s'applique a toutes les situations similaires ?)
        │
        ▼
  Si generalizable :
    - Formuler une regle claire
    - Proposer l'ajout dans `.agent/rules.md` (section "Lecons apprises")
    - YDEEP master valide
    - Tous les agents appliquent immediatement
        │
        ▼
  Si ponctuel :
    - Logger dans changelog (contexte, pas regle)
    - Ne pas creer de regle
```

## Format des regles apprises

Chaque regle dans `.agent/rules.md` suit ce format :

```
- [YYYY-MM-DD] [description de la regle] (source: [agent] — [contexte de la correction])
```

Exemples :
- `[2026-04-04] Sujets email en ASCII uniquement (source: agent-comms — Gmail corrompt UTF-8)`
- `[2026-04-04] Ne pas proposer de dates passees pour les relances (source: agent-sales — correction the user)`

## Categories de corrections

| Type | Exemple | Ou stocker |
|------|---------|-----------|
| **Regle technique** | ASCII subjects, routing email | `.agent/rules.md` section Qualite |
| **Preference ton/style** | "Trop formel", "plus direct" | `.agent/rules.md` section Qualite + memoire feedback |
| **Erreur factuelle** | Mauvais nom de client, mauvais montant | Log dans changelog (ponctuel) |
| **Strategie** | "On ne relance pas ce type de prospect" | `.agent/rules.md` section Alertes ou constraints de l'agent |

## Integration avec les evals

Quand une correction est capturee :
1. Creer un cas de test dans `.agent/evals/{agent}/` :
   - Input : la demande originale
   - Bad output : ce que l'agent avait produit
   - Good output : ce que the user a valide
   - Regle : la regle extraite
2. Les futurs changements de prompts/skills seront testes contre ces evals

## Regles du protocole

- Ne JAMAIS creer une regle sans que the user ait valide (implicitement ou explicitement)
- Si la correction est ambigue, demander : "Je note ca comme regle pour la prochaine fois ?"
- Preferer des regles precises a des regles vagues ("ASCII subjects" > "faire attention aux accents")
- Revoir les regles mensuellement — supprimer celles qui ne s'appliquent plus

## Checklist de fin de session

Avant de conclure une conversation, YDEEP se pose ces questions :

1. **Correction repetee ?** — Ai-je rate un signal implicite que j'aurais du capter plus tot ?
2. **Preference decouverte ?** — Outil, workflow, style, format que the user prefere ?
3. **Contexte projet ?** — Nouvelle info sur un projet, un contact, une deadline ?
4. **Regle manquante ?** — Un pattern qui devrait etre dans rules.md ?

Si oui a une de ces questions → sauvegarder en memoire ou rules.md AVANT de finir.
