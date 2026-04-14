---
name: sync-state
description: Synchronise l'etat partage .agent/ avec la memoire locale et presente la queue a the user
user_invocable: true
---

# Sync State — YDEEP

Pont entre l'etat partage (.agent/ dans le repo) et la memoire locale. A utiliser en debut de session ou apres un audit nocturne.

## Etapes

### 1. Pull les dernieres modifications
- `git pull origin main` pour recuperer les commits du nightly-audit ou d'autres agents remote

### 2. Lire l'etat partage
- Lis `.agent/state.json` — verifie version et last_updated
- Lis `.agent/changelog.md` — recupere les entrees depuis la derniere sync
- Lis `.agent/queue.md` — recupere les actions en attente
- Lis `.agent/rules.md` — verifie les nouvelles regles apprises

### 3. Synchroniser la memoire locale
- Compare `.agent/state.json` avec `memory/project_architecture.md`
- Si divergence (skills ajoutees, projets changes, triggers modifies) → mettre a jour `memory/project_architecture.md`
- Si nouvelles regles dans `.agent/rules.md` → mettre a jour `memory/feedback_agent_rules.md`

### 4. Presenter le resume a the user

Format de sortie :

```
SYNC YDEEP — [date]

DERNIERE MAJ
- state.json v[N] — mis a jour le [date]
- Derniere action : [derniere ligne changelog]

CHANGELOG RECENT
- [entrees depuis derniere sync, max 10]

QUEUE — [nb] actions en attente
- [ ] [action 1]
- [ ] [action 2]
(si actions > 3 jours : signaler en URGENT)

NOUVELLES REGLES
- [regles ajoutees recemment]
(ou "Aucune nouvelle regle")

DIVERGENCES CORRIGEES
- [ce qui a ete mis a jour dans la memoire locale]
(ou "Memoire locale a jour")
```

### 5. Demander a the user
- Pour chaque action en queue : "Tu valides ? (oui/non/plus tard)"
- Si oui → executer l'action et cocher dans queue.md
- Si non → supprimer de queue.md
- Si plus tard → laisser en attente
