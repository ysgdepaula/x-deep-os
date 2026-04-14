# Scout — Output Schema du sous-agent

Le sous-agent `ydeep-scout` (template `sub-scout.yaml`) retourne **toujours** un JSON conforme a ce schema. Le skill `/scout` parse ce JSON pour generer le rapport + les propositions.

## Schema

```json
{
  "input": {
    "type": "url | text | repo | paper",
    "value": "<raw input>",
    "slug": "YYYY-MM-DD-short-slug",
    "title": "<extracted title if URL>",
    "author": "<handle if detected>"
  },
  "findings": [
    {
      "claim": "<1 phrase factuelle>",
      "evidence": "<extrait ou paraphrase>",
      "sources": [
        { "name": "Karpathy", "url": "https://...", "type": "expert | lab | repo | newsletter | other" }
      ],
      "confidence": 1
    }
  ],
  "verdict": {
    "label": "NEW | ALREADY_DONE | CONTRADICTS | IMPROVEMENT",
    "confidence": 4,
    "reasoning": "<2-3 phrases : pourquoi ce verdict>",
    "cross_refs": {
      "knowledge_articles": ["path1.md", "path2.md"],
      "state_agents": ["ydeep-research"],
      "state_skills": ["research-scan"]
    }
  },
  "proposals": [
    {
      "title": "<titre action imperative>",
      "effort": "XS | S | M | L",
      "gain": "<1 phrase impact attendu>",
      "files_affected": ["path1", "path2"],
      "risk": "low | medium | high",
      "tag": "research | engineering | knowledge",
      "rationale": "<pourquoi cette proposition>"
    }
  ],
  "new_sources_detected": [
    {
      "name": "<nom>",
      "url": "<url>",
      "citations_count": 3,
      "why_relevant": "<1 phrase>"
    }
  ],
  "meta": {
    "sources_queried": 12,
    "sources_responded": 9,
    "duration_seconds": 180,
    "mode": "deep | quick"
  }
}
```

## Regles

- **findings** : jamais vide. Minimum 1 finding meme pour ALREADY_DONE.
- **confidence** : echelle 1-5 ; 1 = spec ou rumeur, 5 = papier peer-reviewed ou code open-source verifiable.
- **verdict.confidence** : agregee sur findings. < 3 = incertain, remonter au rapport mais pas en propositions.
- **proposals** : vide si verdict != IMPROVEMENT. Max 3 items. Si effort=L, marquer risk=medium minimum.
- **new_sources_detected** : vide sauf si une source non-listee dans scout-sources.md apparait 3+ fois dans findings.
- **files_affected** : chemins relatifs au repo root. Si liste > 10, le skill ajoute automatiquement le label `blueprint`.

## Exemples

### Exemple 1 — IMPROVEMENT

```json
{
  "input": { "type": "url", "value": "https://x.com/karpathy/status/123", "slug": "2026-04-14-karpathy-llm-os", "title": "LLM as new OS", "author": "karpathy" },
  "findings": [
    {
      "claim": "Karpathy propose de traiter le LLM comme un OS avec des apps/processes",
      "evidence": "Thread X avec schema : LLM = kernel, agents = processes, context window = RAM, tools = syscalls",
      "sources": [{ "name": "Karpathy", "url": "https://x.com/karpathy/...", "type": "expert" }],
      "confidence": 5
    }
  ],
  "verdict": {
    "label": "IMPROVEMENT",
    "confidence": 4,
    "reasoning": "YDEEP utilise deja une architecture agent hierarchique mais ne formalise pas la metaphore OS. La metaphore clarifie les roles et aide a expliquer le systeme (utile pour pitch your company).",
    "cross_refs": {
      "knowledge_articles": [".agent/knowledge/articles/platform/agent-architecture.md"],
      "state_agents": ["ydeep-master"],
      "state_skills": []
    }
  },
  "proposals": [
    {
      "title": "Ajouter section 'LLM as OS' dans agent-architecture.md",
      "effort": "XS",
      "gain": "Meilleure explicabilite architecture, reutilisable pour pitch your company",
      "files_affected": [".agent/knowledge/articles/platform/agent-architecture.md"],
      "risk": "low",
      "tag": "knowledge",
      "rationale": "Proposition documentation, zero risque technique, gain pedagogique eleve"
    }
  ],
  "new_sources_detected": [],
  "meta": { "sources_queried": 12, "sources_responded": 8, "duration_seconds": 165, "mode": "deep" }
}
```

### Exemple 2 — ALREADY_DONE

```json
{
  "input": { "type": "text", "value": "multi-agent validation par consensus", "slug": "2026-04-14-consensus-validation" },
  "findings": [
    {
      "claim": "Validation par consensus reduit hallucinations de 30-40%",
      "evidence": "Paper 'Debate and Consensus for LLM Agents' (2025) + implementation CrewAI",
      "sources": [
        { "name": "arxiv.org/abs/2503.xxxxx", "url": "...", "type": "other" },
        { "name": "CrewAI docs", "url": "...", "type": "repo" }
      ],
      "confidence": 4
    }
  ],
  "verdict": {
    "label": "ALREADY_DONE",
    "confidence": 5,
    "reasoning": "YDEEP a deja ydeep-validator (level 2) qui joue ce role + protocole validation.md. Pas de duplication necessaire.",
    "cross_refs": {
      "knowledge_articles": [],
      "state_agents": ["ydeep-validator"],
      "state_skills": ["validate"]
    }
  },
  "proposals": [],
  "new_sources_detected": [],
  "meta": { "sources_queried": 8, "sources_responded": 6, "duration_seconds": 95, "mode": "deep" }
}
```

### Exemple 3 — CONTRADICTS

```json
{
  "input": { "type": "url", "value": "https://...", "slug": "2026-04-14-anthropic-no-autoapprove" },
  "findings": [
    {
      "claim": "Anthropic recommande de ne jamais auto-approve les actions external-facing (email, git push)",
      "evidence": "Engineering blog post : 'Human-in-the-loop for external side effects'",
      "sources": [{ "name": "Anthropic Engineering", "url": "...", "type": "lab" }],
      "confidence": 5
    }
  ],
  "verdict": {
    "label": "CONTRADICTS",
    "confidence": 5,
    "reasoning": "YDEEP a actuellement ydeep-engineering en level 1 qui pourrait pusher des PRs. Contradiction partielle : nous gardons human approve via Telegram, donc ok. Mais flagger pour revue.",
    "cross_refs": {
      "knowledge_articles": [".agent/knowledge/articles/core/git-discipline.md"],
      "state_agents": ["ydeep-engineering"],
      "state_skills": []
    }
  },
  "proposals": [
    {
      "title": "Auditer tous les flows qui passent en production sans approve Telegram explicite",
      "effort": "S",
      "gain": "Alignement avec recommandations Anthropic, evite incidents",
      "files_affected": [".github/workflows/auto-fix.yml", ".agent/protocols/validation.md"],
      "risk": "low",
      "tag": "engineering",
      "rationale": "Audit preventif, pas d'implementation immediate"
    }
  ],
  "new_sources_detected": [],
  "meta": { "sources_queried": 10, "sources_responded": 7, "duration_seconds": 145, "mode": "deep" }
}
```
