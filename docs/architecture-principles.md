# X-DEEP Architecture Principles

Four principles that shape how X-DEEP separates concerns.
Follow these when adding new agents, skills, or knowledge.

---

## 1. Three layers: knowledge, agents, skills

| Layer | Question it answers | Example |
|---|---|---|
| **Knowledge** | *What is true in this domain?* | "Our ICP is architecture firms in AURA." Compiled article in `.agent/knowledge/articles/`. Durable, evolves slowly. |
| **Agents** | *Who am I and what's my mission?* | `xdeep-sales` — "I close deals with progressive autonomy." YAML template in `.agent/templates/`. Identity + constraints. |
| **Skills** | *How do I perform a specific task?* | `/prep-call` — step-by-step instructions to produce a pre-call brief. SKILL.md in `.claude/skills/`. |

**Why this matters**: when these layers get mixed, you end up with 500-line agent prompts that embed knowledge that should live in a compiled article, or with skills that carry identity and can't be reused. Separation = scalability.

---

## 2. Skills are verbs, agents are nouns

The single most important naming rule.

### Good
| Layer | Name | Why |
|---|---|---|
| Agent | `xdeep-sales` | A role, a noun, an identity |
| Agent | `xdeep-engineering` | A domain |
| Skill | `/prep-call` | A task, a verb-noun |
| Skill | `/scaffold` | An action |
| Skill | `/review-pipeline` | A specific task |
| Skill | `/propose-refactor` | An explicit action |

### Anti-pattern
| Bad | Why it fails |
|---|---|
| `/engineering` | Sounds like a role, not a task. Tempting to stuff it with identity + knowledge + procedures. |
| `/sales` | Same issue. Becomes a 300-line prompt with ICP, voice guide, procedures, examples. |
| `/comms` | Same. |

### The fix
Split the domain-skill into several verb-skills, all owned by the same agent:

```yaml
# Before (anti-pattern)
skills_owned: [engineering]   # one god-skill

# After (clean)
skills_owned: [scaffold, validate-all, propose-refactor]
```

The agent (`xdeep-engineering`) stays the identity. Each skill is a clean, reusable task.

### Quick test when naming a skill
> "Can I say 'I want to <skill-name> something' and have it sound natural?"

- `/scaffold` → "I want to scaffold a new agent" ✅
- `/engineering` → "I want to engineering something" ❌
- `/weekly-digest` → "I want to compile a weekly-digest" ✅ (borderline — it's noun-ish but reads as a task)

---

## 3. Skills load context on demand, they don't embed it

A skill is **instructions**, not a dump of knowledge.

### Good
```markdown
## Steps
1. Read `.agent/knowledge/articles/sales/icp-profile.md`
2. Read the prospect's enrichment data from `/contacts/<id>.md`
3. Draft the email using the voice from `.agent/knowledge/articles/comms/voice-guide.md`
```

The skill is 50 lines. The knowledge lives elsewhere, referenced, reused.

### Bad
```markdown
## Steps
Here is our ICP: [5 pages of ICP description embedded]
Here is our voice: [3 pages of voice guide embedded]
Now write the email.
```

The skill is 800 lines. The knowledge rots in the skill and gets out of sync with reality.

### Rule of thumb
If a skill is more than 200 lines, it probably embeds context that should live as a knowledge article.

---

## 4. Agents delegate, they don't execute directly when possible

The master agent (`xdeep-master`) orchestrates. It should delegate to a sub-agent whose scope matches the task, rather than doing everything itself.

### Good
User: "Draft the follow-up email for Lopez."
→ `xdeep-master` delegates to `xdeep-sales` → which invokes `/draft-followup` skill.

### Bad
`xdeep-master` tries to draft the email itself, loading the sales ICP, the voice guide, the pipeline state, and writing the email — all in one long prompt.

### Why
Specialization is cheaper than generalization. Each sub-agent has a narrow scope, fewer constraints to juggle, and clearer evaluation metrics (its own `approval_rate`).

---

## Anti-patterns summary

| Anti-pattern | Symptom | Fix |
|---|---|---|
| Domain-named skill | `/sales`, `/engineering`, `/comms` | Split into verb-skills owned by the agent |
| God-skill | SKILL.md > 500 lines | Extract knowledge into articles, split skill by task |
| Embedded knowledge | Same content copy-pasted across 3 skills | Move to `.agent/knowledge/articles/`, reference from skills |
| Master doing the work | `CLAUDE.md` has 1000 lines of sales/finance/comms procedures | Delegate to sub-agents |
| Agent with no constraints | Agent YAML has empty `constraints: []` | Every agent must have explicit boundaries |

---

## Design influences

These principles stand on the shoulders of:

- **Andrej Karpathy — "Software 2.0" and "LLM OS"** — the idea that an LLM + tools is a new substrate for software, where the "code" is prompt + data and the "OS" is the harness around it. X-DEEP applies this to personal executive work.
- **Anthropic — "Building effective agents" (2024)** — the orchestrator/worker pattern, the argument for starting simple and adding complexity only when measured. X-DEEP's master + sub-agents structure is a direct application.
- **Cognition AI — "Don't build multi-agents" (2025)** — the warning that parallel agents lose context and drift. X-DEEP addresses this with a **shared changelog** (`.agent/changelog.md`) and **shared state** (`.agent/state.json`) so that all sessions read from and write to the same source of truth. We don't run agents in parallel without coordination — we run them sequentially or with explicit handoffs.
- **Model Context Protocol (MCP) spec** — the shared tool pool across agents. X-DEEP uses MCP as the integration layer for Gmail, Notion, banks, etc.
- **Claude Agent SDK (Sep 2025)** — the tool-use loop pattern underlying the Telegram harness.

If you want to go deeper, start with Karpathy's post on LLM OS and Anthropic's "Building effective agents" guide.
