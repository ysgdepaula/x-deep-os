---
name: office-monitor
description: Cron hebdo delta tracker — detecte nouvelles annonces, baisses de prix, alertes opportunites
version: 1.0.0
agent: x-deep-office
triggers:
  - office monitor
  - surveiller bureaux
  - monitor offices
  - delta bureaux
---

# Office Monitor — Delta Tracker Hebdomadaire

Surveille les annonces de bureaux sur une zone configuree. Detecte les deltas (nouvelles annonces, baisses de prix, annonces retirees) et alerte the user.

## Quand utiliser

- Trigger cron automatique : `0 8 * * 1` (lundi 8h)
- Manuellement : "monitore les bureaux Paris 2" ou "/office-monitor"

## Configuration

Le monitor surveille les zones definies dans la derniere recherche. Il se base sur le dernier fichier Excel dans `realestate/BDD_Bureaux_*.xlsx` comme reference.

## Process

### Phase 1 — Identifier la reference

Trouver le dernier fichier `realestate/BDD_Bureaux_*.xlsx` pour la zone cible.
Si aucun fichier existe : lancer `/office-search` d'abord.

### Phase 2 — Re-scrape

Lancer `/office-search` sur la meme zone pour obtenir les annonces actuelles.
Generer un nouveau fichier Excel.

### Phase 3 — Comparer (delta detection)

Pour chaque annonce dans le nouveau fichier, chercher si elle existait dans la reference :
- **Match** = meme adresse normalisee + surface +/- 10%
- **Nouvelle** = pas de match dans la reference
- **Retiree** = dans la reference mais pas dans le nouveau
- **Prix change** = match mais prix different (> 5% de variation)

### Phase 4 — Scorer les deltas

Pour chaque nouvelle annonce ou baisse de prix :
1. Appeler `dvf_get_price_stats` pour la zone
2. Calculer le price_delta
3. Appliquer le scoring model (`realestate/scoring-model.md`)

### Phase 5 — Alerter

**Si score > 80** (haute opportunite) :
- Notification Telegram immediate avec details
- Format :
```
🏢 Office-Deep — Nouvelle opportunite
📍 [Adresse]
📐 [Surface] m2 — [Postes] postes
💰 [Prix] EUR/mois ([Prix/m2/an] EUR/m2/an)
📊 Score: [Score]/100 (DVF zone: [median] EUR/m2/an)
🏷️ [Operateur] via [Broker]
```

**Si 60 < score < 80** : inclure dans le rapport hebdo sans notification immediate.

**Si score < 60** : archiver silencieusement.

### Phase 6 — Rapport hebdo

Generer un rapport synthetique :
```
📊 Office-Deep — Rapport hebdo [Zone] [Date]

Nouvelles annonces : N
Baisses de prix : N
Annonces retirees : N
Score moyen nouvelles : X/100

Top 3 opportunites :
1. [Adresse] — [Score]/100 — [Prix]
2. ...
3. ...

Tendance : prix moyen [hausse/baisse/stable] de X% vs semaine precedente
```

### Phase 7 — Knowledge update

- Sauvegarder le delta dans `.agent/raw/YYYY-MM-DD-office-monitor-[zone].md`
- Mettre a jour `realestate/market-paris.md` si nouvelles stats significatives
- Mettre a jour `realestate/operators-map.md` si nouveaux operateurs detectes

## Archivage

Garder les 4 derniers fichiers Excel (1 mois de reference).
Les plus anciens sont supprimes automatiquement de `realestate/`.

## Trigger cron

A enregistrer via `/schedule` :
```
Name: office-monitor-paris
Cron: 0 8 * * 1
Prompt: /office-monitor Paris 2eme
```
