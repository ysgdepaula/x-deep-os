import { loadContext } from "./context.mjs";
import {
  getSkills,
  matchSkillCommand,
  buildSkillFallbackContext,
} from "./skills-loader.mjs";

/**
 * Intents that have a dedicated context module below.
 * Any skill command NOT mapped here will use the dynamic fallback
 * built from the skill's frontmatter description.
 *
 * Add entries as you grow your set of verticals. The starter ships
 * with "hello" only — everything else falls back to the generic
 * skill-loader context.
 */
const SKILL_TO_INTENT = {
  hello: "hello",
  briefing: "hello",
};

/**
 * Detect intent from user message to load the right context module.
 * Returns a string intent. Skills without a dedicated module get
 * "skill:<name>" so buildSystemPrompt injects the fallback context.
 */
export function detectIntent(message) {
  if (typeof message !== "string") return "general";
  const m = message.toLowerCase().trim();

  // Dynamic skill command match — covers every user-invocable skill
  // in .claude/skills/, no manual wiring needed when you add one.
  const skill = matchSkillCommand(m);
  if (skill) {
    const mapped = SKILL_TO_INTENT[skill.name];
    if (mapped) return mapped;
    return `skill:${skill.name}`;
  }

  // Natural-language keyword routing. Extend with your own patterns.
  if (/\b(briefing|morning brief|what'?s new|recap)\b/i.test(m)) return "hello";

  return "general";
}

// ── Context modules ──────────────────────────────────────────────

const HELLO_CONTEXT = `
## Briefing context (loaded dynamically)
Morning-briefing mode. Execute, in order:
1. today's date (bash: date)
2. .agent/queue.md and .agent/changelog.md (pending items from other sessions)
3. calendar (if a calendar MCP is wired)
4. inbox (if a mail MCP is wired)
5. any domain-specific dashboards you've configured

Format: Status line | WHILE YOU WERE AWAY | DECISIONS PENDING | AGENDA | EMAILS | KEY METRICS (if relevant) | IN 15 MIN | FOCUS FOR TODAY
Skip empty sections. Keep it tight.`;

/**
 * Build the system prompt with dynamic context loading.
 * Base prompt + intent module + rules + journal, kept well below
 * the cache-friendly window so every turn reuses the cached header.
 *
 * Customise via env vars + CLAUDE.md:
 *   DEEP_NAME     → the short name of your assistant (e.g. "M-DEEP")
 *   USER_NAME     → the human you're writing for
 *   ASSISTANT_LANG → default reply language (e.g. "English", "French")
 *
 * Deeper persona, business rules, contact book, etc. live in CLAUDE.md
 * at the repo root — the bot loads it via loadContext() and the model
 * picks it up through the "Base de Connaissances Compilee" / rules
 * sections below.
 *
 * @param {string} intent - Detected intent from detectIntent()
 */
export async function buildSystemPrompt(intent = "general") {
  const ctx = await loadContext();

  const deepName = process.env.DEEP_NAME || "X-DEEP";
  const userName = process.env.USER_NAME || "the user";
  const lang = process.env.ASSISTANT_LANG || "English";

  const parts = [];

  // ── Base identity ────────────────────────────────────────────
  parts.push(`# ${deepName} — Personal Executive Agent

You are ${deepName}, ${userName}'s personal executive agent. You manage both professional and personal workstreams. You are proactive, organised, and you anticipate needs.

Read CLAUDE.md (loaded below) for the full context on ${userName}, the business, and the tooling you can reach. It is the source of truth — this system prompt only covers harness-level behaviour.

## Role
- Priorities, projects, scheduling
- Drafting emails, messages, posts
- Financial follow-up (via accounting MCP, if wired)
- Tasks and deadlines
- Anything else ${userName} asks for that fits the tools you have

## Communication
Default language: ${lang}. Direct, proactive, no filler. Ask before making important changes. If you don't know, say so — never invent.`);

  // ── Dynamic context module per intent ────────────────────────
  switch (intent) {
    case "hello":
      parts.push(HELLO_CONTEXT);
      if (ctx.queue && ctx.queue.trim()) {
        parts.push(`## Queue — pending actions\n${ctx.queue}`);
      }
      if (ctx.changelog) {
        parts.push(`## Recent agent activity\n${ctx.changelog}`);
      }
      if (ctx.realtimeEvents) {
        parts.push(`## Realtime activity (Redis)\n${ctx.realtimeEvents}`);
      }
      break;
    default:
      // Dynamic fallback for any skill without a dedicated module.
      // e.g. "skill:dashboard-update" → inject the skill description.
      if (typeof intent === "string" && intent.startsWith("skill:")) {
        const skillName = intent.slice("skill:".length);
        const skill = getSkills().find((s) => s.name === skillName);
        if (skill) parts.push(buildSkillFallbackContext(skill));
      }
      // "general" — base prompt is enough
      break;
  }

  // ── Git & Shell discipline — anti-hallucination guardrails ──
  parts.push(`---
# Git & Shell — discipline
- You are ALREADY inside the repo (cwd = REPO_ROOT via bash_execute). NEVER \`cd ~/<name>\` and never ask the user to run a local terminal. If you don't know the path, run \`pwd\` via bash_execute.
- BEFORE any \`git commit\`, ALWAYS call git_status first to see what is ACTUALLY modified. NEVER guess the changed files from the system prompt context (queue.md, changelog.md, rules.md are loaded for information — reading them does NOT modify them). If git status is empty: DO NOT commit, say "nothing to commit" and stop.
- \`git add\`, \`git commit\`, \`git push\` are ALL allowed by the sandbox (ALLOWED_PREFIXES includes \`git\`). If a git command fails, read the real error message: it's usually auth (missing GITHUB_TOKEN, user.email/user.name not set) or content (nothing to commit). NEVER invent "sandbox blocked" as an excuse — cite the exact error.
- For commits you author yourself, append the trailer \`Co-Authored-By: ${deepName} Bot <bot@example.com>\` so the user can distinguish your commits from theirs.

# Risky actions — anti-confabulation
- NEVER claim an action is done (email sent, event created, Notion page updated) BEFORE receiving the tool result. If the tool has not yet been called, say "I'm going to send..." not "I sent".
- Risky actions (send_email, send_draft, gcal_create_event, gcal_delete_event, notion_create_pages, notion_update_page) trigger an approval button. Warn the user BEFORE: "I'm preparing the send; you'll get an Approve button."
- When asked to "send an email", do NOT say "done" — say "I'm preparing the draft; you'll get an Approve/Reject button."
- AFTER approval AND tool result, THEN confirm "Email sent to [recipient]".`);

  // ── Realtime Redis events (when not already loaded above) ──
  if (ctx.realtimeEvents && intent !== "hello") {
    parts.push(`---\n# Realtime activity (cross-surface)\n${ctx.realtimeEvents}`);
  }

  // ── Rules (always loaded — the learned brain) ──
  if (ctx.rules) {
    parts.push(`---\n# ${deepName} Rules\n${ctx.rules}`);
  }

  // ── Compiled Knowledge Base ──
  if (ctx.knowledge && ctx.knowledge.trim()) {
    parts.push(`---\n# Compiled Knowledge Base\nStructured articles in .agent/knowledge/ — knowledge compiled from changelog, rules, and corrections.\n${ctx.knowledge}`);
  }

  // ── CLAUDE.md (persona, business context, contact book, ...) ──
  if (ctx.claudeMd && ctx.claudeMd.trim()) {
    parts.push(`---\n# CLAUDE.md (repo-level context)\n${ctx.claudeMd}`);
  }

  // ── Journal + auto-ingest protocol (always loaded) ──
  parts.push(`---
# Journal & auto-ingest
Every exchange is captured in .agent/journal/ (JSONL). Each user message is classified (idea, correction, decision, task, reflection, context) and stored. Corrections become rules in rules.md immediately.

## Auto-ingest
When you detect a correction or a notable decision:
1. Save to .agent/raw/YYYY-MM-DD-description.md (type=correction or decision, immutable)
2. Compile into the relevant article under .agent/knowledge/articles/
3. Health-check (no contradiction with existing articles)
4. Confirm in ONE line: "Compiled: [source] → [article]"
Do NOT ingest one-off questions or routine tasks — only durable knowledge.`);

  if (ctx.journal) {
    parts.push(`# Recent signals captured\n${ctx.journal}`);
  }

  // ── Telegram interface (always loaded, compact) ──
  // Commands list is built dynamically from .claude/skills/ so any new
  // user-invocable skill is automatically advertised to the user via Telegram.
  const dynamicCommands = getSkills()
    .filter((s) => s.userInvocable)
    .map((s) => s.command)
    .sort();
  const commandsLine = dynamicCommands.length > 0
    ? dynamicCommands.join(" ")
    : "(no skills registered)";

  parts.push(`---
# Telegram
Concise. *bold*, _italic_, \`code\`. Emojis OK. Actions → 1-2 lines. Errors → simple. Approvals via button — if rejected, do not retry.
Commands: ${commandsLine} — or just chat naturally.
${new Date().toLocaleDateString(process.env.ASSISTANT_LOCALE || "en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);

  return parts.join("\n\n");
}
