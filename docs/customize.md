# Customize X-DEEP OS

Concrete recipes for adapting the OS to your context. Four angles :

1. [Add an MCP server](#add-an-mcp-server) — wire up a new data source
2. [Add an agent](#add-an-agent) — create a new specialized sub-agent
3. [Add a skill](#add-a-skill) — add a concrete task
4. [Vertical adaptations](#vertical-adaptations) — templates for specific industries

---

## Add an MCP server

MCP servers expose tools (functions) that your agent can call. Adding one takes ~10 minutes.

### Use case: connect your accounting API (e.g. QuickBooks)

### 1. Scaffold the service
```bash
cd mcp-servers
node scripts/add-service.mjs quickbooks
```

This copies `services/example-service/` to `services/quickbooks/` with placeholders.

### 2. Implement the tools

Edit `mcp-servers/services/quickbooks/config.json` :
```json
{
  "name": "quickbooks",
  "description": "QuickBooks Online API — invoices, customers, reports",
  "requiredEnv": ["MCP_CONFIG_DIR"],
  "optionalEnv": ["ACCOUNT_NAME"],
  "authType": "oauth2",
  "tools": ["list_invoices", "create_invoice", "get_customer", "list_reports"]
}
```

Edit `mcp-servers/services/quickbooks/tools.mjs` :
```js
import { z } from "zod";
import { loadOAuth2 } from "../../core/auth/oauth2.mjs";

export async function init(config) {
  const auth = await loadOAuth2({
    configDir: `${process.env.MCP_CONFIG_DIR}/credentials/quickbooks-${config.account || "default"}`,
    authUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scopes: ["com.intuit.quickbooks.accounting"]
  });
  return { auth };
}

export const tools = [
  {
    name: "list_invoices",
    description: "List invoices from QuickBooks, optionally filtered by date or customer",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        since: { type: "string", format: "date" }
      }
    },
    handler: async (input, state) => {
      const token = await state.auth.getAccessToken();
      const response = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/<realm-id>/query?query=SELECT * FROM Invoice`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data.QueryResponse.Invoice, null, 2) }] };
    }
  },
  // ... more tools
];
```

### 3. Provide credentials

Create the OAuth client in Intuit Developer portal, download the credentials, save at `mcp-servers/credentials/quickbooks-default/oauth-client.json`. Run the initial auth flow to generate `token.json`.

### 4. Register in Claude Code

Add to `.claude/settings.local.json` :
```json
{
  "mcpServers": {
    "quickbooks": {
      "command": "node",
      "args": ["./mcp-servers/core/server.mjs", "--service", "quickbooks"],
      "env": { "MCP_CONFIG_DIR": "./mcp-servers" }
    }
  }
}
```

### 5. Test
Restart Claude Code. Ask: `list my QuickBooks invoices from last month`.

### 6. Expose to an agent

In `.agent/templates/<prefix>-finance.yaml` :
```yaml
tools_allowed: [bank, quickbooks, notion, gmail]
```

Run `node .agent/scripts/validate-all.mjs` to confirm.

---

## Add an agent

Agents are specialized sub-identities. Add one when an existing agent's scope gets too wide, or when a new domain appears (e.g. you acquire a new business line).

### Use case: add a `<prefix>-acquisitions` agent

### 1. Scaffold
From Claude Code :
```
scaffold agent acquisitions
```

This will :
- Create `.agent/templates/<prefix>-acquisitions.yaml`
- Add the agent to `.agent/state.json`
- Update `CLAUDE.md` hierarchy section

### 2. Customize the template

```yaml
agent:
  id: xdeep-acquisitions         # will be renamed to <your-prefix>-acquisitions by install.sh
  name: M-DEEP Acquisitions
  role: AI M&A analyst for service-business acquisitions
  goal: Evaluate and track acquisition targets against our buying criteria

  backstory: >
    Expert in buy-side M&A for service businesses (10-100 employees, EBITDA 0.5-5M).
    Maintains the target pipeline, enriches targets with public data, produces
    teaser analyses and LOI drafts. Never commits to anything financially —
    only proposes.

  autonomy_level: 0               # level 0 until trust is established

  constraints:
    - Never commit to a figure or LOI without user validation
    - Read .agent/knowledge/articles/acquisitions/criteria.md before every analysis
    - Source every factual claim (company data, financials) with a link
    - Flag any target that doesn't match the criteria explicitly

  tools_allowed: [web-search, web-fetch, notion, gmail]
  skills_owned: [analyze-target, draft-teaser, compare-targets]

  reports_to: xdeep-master
  output_validation: required     # all outputs go through validator
```

### 3. Create knowledge

```bash
mkdir -p .agent/knowledge/articles/acquisitions/
cat > .agent/knowledge/articles/acquisitions/criteria.md <<EOF
# Acquisition Criteria

## Size
- Revenue: 1-10 M€
- EBITDA: 500k-5M€
- Employees: 10-100

## Geography
- Auvergne-Rhône-Alpes primary
- Bourgogne-Franche-Comté opportunistic

## Type of business
- Landscaping, green spaces, horticultural services
- Must have recurring contracts (>40% of revenue)

## Red flags
- Owner-dependent revenue (>50% from personal relationships)
- Pending litigation
- Customer concentration >30%
EOF
```

### 4. Create the skills

Following the same `/scaffold` pattern, create `/analyze-target`, `/draft-teaser`, `/compare-targets`.

### 5. Validate
```bash
node .agent/scripts/validate-all.mjs
```

Should report `All 3 validators passed`. Commit, push, done.

---

## Add a skill

Skills are the concrete tasks. Adding one is the most common customization.

### Naming rule
**Skills are verbs** (see [`architecture-principles.md`](architecture-principles.md#skills-are-verbs-agents-are-nouns)) :
- ✅ `/review-pipeline`, `/prep-call`, `/chase-invoice`, `/analyze-target`
- ❌ `/engineering`, `/sales`, `/finance`, `/marketing`

### Use case: `/chase-invoice`

### 1. Scaffold
```
scaffold skill chase-invoice
```

### 2. Edit the SKILL.md

```markdown
---
name: chase-invoice
description: Draft a follow-up email for an overdue invoice using the company voice
user_invocable: true
triggers:
  - chase invoice
  - relance facture
  - overdue invoice
---

# /chase-invoice

Draft a follow-up email for an overdue invoice. Never send — always propose to the user.

## Inputs expected
- **Invoice number** (or customer name if unambiguous)
- **Days overdue** (if known)

## Steps
1. Look up the invoice in the accounting MCP (Pennylane / QuickBooks)
2. Read `.agent/knowledge/articles/comms/voice-guide.md` for tone
3. Read `.agent/knowledge/articles/finance/payment-terms.md` for policy (grace period, late fees, escalation)
4. Check prior follow-ups sent to this customer in Gmail (avoid spamming)
5. Draft the email :
   - Tone: direct, professional, no guilt-tripping
   - Include: invoice number, amount, due date, days overdue
   - Remind of payment method
   - Set an expectation for next action
6. Return the draft — do NOT send

## Output format
```
DRAFT: follow-up for <invoice-id>
To: <customer email>
Subject: Rappel facture <id> — <amount>

<email body>

---
Context:
- Last follow-up: <date or "none">
- Customer payment history: <summary>
- Recommended next step if no reply in 7 days: <action>
```

## Guardrails
- Max 150 words in email body
- ASCII-only subject line (UTF-8 breaks some mail clients)
- Never propose an action that would damage the customer relationship without user approval
- If customer has multiple overdue invoices, group them in one email
```

### 3. Add to owning agent

Edit `.agent/templates/<prefix>-finance.yaml` :
```yaml
skills_owned: [weekly-cash-review, chase-invoice]
```

### 4. Validate and test
```bash
node .agent/scripts/validate-all.mjs
```

In Claude Code : `chase invoice 2024-0042`.

---

## Vertical adaptations

Recipes for common service business verticals.

### Architecture firm

**Agents to add** :
- `<prefix>-projects` — tracks ongoing projects, milestones, site visits
- `<prefix>-submissions` — public tender responses (mémoires techniques)

**Skills to add** :
- `/draft-memoire` — generates a public tender memoire respecting NF compliance
- `/track-site-visit` — logs site visit notes into Notion
- `/prep-client-meeting` — prep for clients with past project history

**Knowledge articles** :
- `articles/projects/active-list.md`
- `articles/submissions/memoire-template.md`
- `articles/compliance/nf-p98.md`

### Landscaping holding (like the Marc Dubois example)

**Agents to add** :
- `<prefix>-operations` — weekly KPIs across subsidiaries
- `<prefix>-acquisitions` — M&A pipeline
- `<prefix>-procurement` — supplier contracts

**Skills to add** :
- `/weekly-comex-prep` — generates the Monday executive committee brief
- `/review-tender` — analyzes a public tender for fit + bid strategy
- `/compile-p-and-l` — monthly P&L consolidation

**Knowledge articles** :
- `articles/operations/subsidiaries.md` (one per subsidiary)
- `articles/acquisitions/criteria.md`
- `articles/suppliers/rankings.md`

### Legal practice

**Agents to add** :
- `<prefix>-cases` — case tracking
- `<prefix>-research` (narrower — legal research)
- `<prefix>-billing` — time tracking + invoicing

**Skills to add** :
- `/research-case-law` — retrieves relevant case law for a specific question
- `/draft-client-update` — produces a client-safe update on their case
- `/log-billable-hours` — logs time entries from your calendar

**Knowledge articles** :
- `articles/cases/active-list.md`
- `articles/jurisprudence/notes.md`
- `articles/clients/index.md`

### Consulting firm

**Agents to add** :
- `<prefix>-engagements` — active engagements
- `<prefix>-proposals` — sales proposals and SOWs
- `<prefix>-delivery` — delivery team coordination

**Skills to add** :
- `/draft-proposal` — SOW draft from a RFP
- `/prep-delivery-review` — prep weekly delivery review with team leads
- `/chase-feedback` — follow up for post-engagement feedback

---

## When NOT to customize

If you find yourself creating a new agent for every new project or every new customer, you're doing it wrong :

- **Projects, customers, tickets → knowledge articles**, not agents
- **Temporary campaigns → skills with parameters**, not new agents
- **A new business line → yes, maybe a new agent**, but first check if an existing agent can handle it with a new knowledge article

Rule of thumb : **add an agent only when a domain has persistent constraints that differ from existing agents**. Otherwise, add a skill or knowledge.

---

## Testing your customization

After each change :

1. **Validators** : `node .agent/scripts/validate-all.mjs`
2. **Claude Code local** : open, test the trigger, check the output
3. **Run the skill via the bot** (if deployed) : same test via Telegram
4. **Commit, push, watch CI** : `ci-quality.yml` will catch regressions

If CI fails, the file limit might be the cause — split large changes into multiple PRs with the appropriate label (`auto-fix` = 3 files, `enhancement` = 10, `blueprint` = 20).

---

## See also

- [`architecture.md`](architecture.md) — how the layers fit together
- [`architecture-principles.md`](architecture-principles.md) — the rules
- [`getting-started.md`](getting-started.md) — first-time setup
- [`deployment.md`](deployment.md) — 24/7 infra
