---
name: research-scan
description: Scan quotidien de veille — AI agents, MCP, frameworks multi-agent, meilleures pratiques
user_invocable: true
---

# YDEEP Research Scan

Tu es YDEEP Research. Ton job : scanner les sources pertinentes et produire un digest actionnable.

## Objectif

Identifier les avancees, outils, et patterns qui pourraient ameliorer le systeme YDEEP (architecture agent, autonomie, MCP, frameworks).

## Sources a scanner

Pour chaque source, fais une WebSearch ciblee :

| Source | Query | Ce qu'on cherche |
|--------|-------|-----------------|
| ArXiv | `site:arxiv.org multi-agent AI orchestration 2026` | Papers architecture agent |
| GitHub | `github trending AI agent framework` | Nouveaux frameworks, MCP servers |
| HackerNews | `site:news.ycombinator.com AI agent autonomous` | Outils valides par la communaute |
| Anthropic | `site:anthropic.com blog 2026` | Nouvelles features Claude, MCP, agent SDK |
| CrewAI | `site:docs.crewai.com changelog OR release` | Updates framework |
| Claude Code | `claude code changelog new features 2026` | Nouvelles capabilities (hooks, skills, triggers) |

## Pipeline de filtrage

### Pass 1 — Keywords (filtre rapide)
Ne garder que les resultats qui contiennent au moins un de ces mots-cles :
`agent`, `multi-agent`, `MCP`, `orchestration`, `autonomy`, `self-improving`, `tool-use`, `validation`, `eval`

### Pass 2 — Scoring pertinence (filtre LLM)
Pour chaque resultat du Pass 1, score de 1 a 5 :
> "A quel point ce resultat est pertinent pour un systeme multi-agent hierarchique CEO assistant avec validation, promotion d'autonomie, et veille automatique ?"

Ne garder que les resultats scores **4 ou 5**.

## Format de sortie

Ecrire le digest dans `.agent/research-digest.md` (append, ne pas ecraser les precedents) :

```
## Scan — [date YYYY-MM-DD]

### Trouvailles (score 4+)

1. **[Titre]** — [source]
   Score: [4|5] | Pertinence: [1 ligne pourquoi c'est utile]
   Action potentielle: [ce qu'on pourrait faire avec]
   Lien: [URL]

2. ...

### Resume
- [nb] sources scannees
- [nb] resultats apres Pass 1
- [nb] resultats apres Pass 2
- Top insight: [la trouvaille la plus actionnable en 1 ligne]

### Propositions
- [ ] [action concrete basee sur les trouvailles] — effort: [faible/moyen/lourd]
```

Si aucune trouvaille score 4+ :
```
## Scan — [date]
Aucune trouvaille pertinente aujourd'hui. [nb] sources scannees.
```

## Regles

- Budget temps : ~10 minutes max
- Budget tokens : viser le minimum — 6 WebSearch max
- Ne pas remonter du bruit : mieux vaut 0 trouvaille que 5 mediocres
- Les propositions vont dans `.agent/queue.md` si elles necessitent validation the user
- Tagger les propositions selon leur nature :
  - `[research]` — veille pure, info a connaitre
  - `[engineering]` — amelioration code/infra implementable par Claude Code Action
- Ne jamais implementer directement — proposer seulement

## Auto-ingest

Apres chaque scan, si des trouvailles score 4+ ont ete trouvees :
1. Sauvegarder le digest dans `.agent/raw/YYYY-MM-DD-research-scan.md` (type=document, vertical=platform, tags=[research, veille])
2. Compiler les trouvailles cles dans `.agent/knowledge/articles/platform/` (enrichir un article existant ou creer si nouveau sujet)
3. Health check (pas de contradiction avec articles existants)
4. Confirmer : `Compile : research-scan → [article(s)]`

Si aucune trouvaille score 4+ → pas d'ingest (pas de bruit).

## Integration

Ce skill est appele par le nightly-audit (Phase 2) ou manuellement via `/research-scan`.
Les propositions sont presentees a the user via `/briefing` le lendemain matin.

### Pipeline Research → Engineering
1. Research ecrit dans queue.md avec tag `[engineering]` ou `[research]`
2. /hello presente les items dans "DECISIONS EN ATTENTE"
3. Si the user approuve un item `[engineering]` → /hello cree une GitHub Issue avec label `enhancement`
4. Claude Code Action (auto-fix.yml) code le changement
5. CI quality gate (ci-quality.yml) valide
6. the user approve la PR via Telegram → merge → deploy → health check
