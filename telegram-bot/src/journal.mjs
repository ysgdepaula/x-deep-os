import { writeFileSync, readFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

// TODO: wire this up — see docs/customize.md
// The original project persisted corrections/patterns to Redis via a
// dedicated learning-buffer module. The starter ships with no-op stubs
// so the core journaling + rule extraction still works without Redis.
const saveLearning = async () => {};
const trackPattern = async () => {};

// Bot reference — set by index.mjs at startup so journal can send feedback
let _bot = null;
let _chatId = null;
export function setFeedbackTarget(bot, chatId) { _bot = bot; _chatId = chatId; }

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.REPO_PATH || resolve(__dirname, "../..");
const JOURNAL_DIR = resolve(REPO_ROOT, ".agent/journal");
const RULES_PATH = resolve(REPO_ROOT, ".agent/rules.md");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Ensure journal directory exists (lazy — created on first write, not at import time,
// to avoid creating /repo before git clone runs in context.mjs syncRepo)
function ensureJournalDir() {
  if (!existsSync(JOURNAL_DIR)) mkdirSync(JOURNAL_DIR, { recursive: true });
}

/**
 * Classify a user message + bot response using Claude Haiku.
 * Returns: { type, summary, tags, rule_extracted }
 *
 * Types: idea | correction | decision | task | reflection | context | interaction
 */
async function classify(userMessage, botResponse, intent) {
  const inputText = typeof userMessage === "string"
    ? userMessage
    : Array.isArray(userMessage)
      ? userMessage.filter(b => b.type === "text").map(b => b.text).join(" ")
      : JSON.stringify(userMessage);

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: `You are a message classifier. Analyze the exchange and reply ONLY with valid JSON, nothing else.

Possible types:
- idea : the user shares an idea, vision, or improvement
- correction : the user corrects the assistant ("no", "not like that", "redo", disagreement with the reply)
- decision : the user makes a strategic or operational decision
- task : the user asks for a concrete action to execute
- reflection : the user thinks out loud, analyses a situation
- context : the user shares context (info on a person, a situation, a contact)
- interaction : standard exchange without a specific signal

Format:
{"type":"...","summary":"one-line summary, max 100 chars","tags":["tag1","tag2"],"rule_extracted":"learned rule if correction, otherwise null"}`,
      messages: [{
        role: "user",
        content: `Intent: ${intent}\n\nUser: ${inputText.substring(0, 500)}\n\nAssistant: ${(botResponse || "").substring(0, 300)}`,
      }],
    });

    const text = response.content[0]?.text?.trim();
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { type: "interaction", summary: inputText.substring(0, 100), tags: [], rule_extracted: null };
  } catch (err) {
    console.error(`[JOURNAL] Classification error: ${err.message}`);
    return { type: "interaction", summary: inputText.substring(0, 100), tags: [], rule_extracted: null };
  }
}

/**
 * Capture an interaction in the daily JSONL journal.
 * Called async (fire-and-forget) after each chat() exchange.
 */
export async function capture({ channel = "telegram", chatId, intent, input, output }) {
  try {
    const classification = await classify(input, output, intent);

    const entry = {
      ts: new Date().toISOString(),
      channel,
      type: classification.type,
      intent,
      input: typeof input === "string" ? input.substring(0, 1000) : "[multimodal]",
      output: (output || "").substring(0, 500),
      summary: classification.summary,
      rule_extracted: classification.rule_extracted,
      tags: classification.tags || [],
      session_id: `${channel}_${chatId}`,
    };

    // Write to daily JSONL file
    ensureJournalDir();
    const date = new Date().toISOString().split("T")[0];
    const filePath = resolve(JOURNAL_DIR, `${date}.jsonl`);
    writeFileSync(filePath, JSON.stringify(entry) + "\n", { flag: "a" });

    console.log(`[JOURNAL] ${classification.type} | ${classification.summary}`);

    // Immediate consolidation: corrections go straight into rules.md (don't wait for nightly)
    if (classification.rule_extracted) {
      console.log(`[JOURNAL] RULE EXTRACTED: ${classification.rule_extracted}`);
      applyRuleImmediately(classification.rule_extracted, classification.summary);
      // TODO: wire this up — see docs/customize.md
      // Original project also persisted to Redis and surfaced a
      // Validate/Correct/Ignore inline keyboard via learning-feedback.mjs.
      saveLearning({
        type: "correction",
        context: `[${intent}] ${classification.summary}`,
        correction: typeof input === "string" ? input.substring(0, 300) : "[multimodal]",
        rule: classification.rule_extracted,
      }).catch(err => console.error(`[LEARN] ${err.message}`));
    }

    // Auto-create eval for corrections
    if (classification.type === "correction") {
      createEvalFromCorrection(entry, classification);
      if (!classification.rule_extracted) {
        saveLearning({
          type: "correction",
          context: `[${intent}] ${classification.summary}`,
          correction: typeof input === "string" ? input.substring(0, 300) : "[multimodal]",
        }).catch(err => console.error(`[LEARN] ${err.message}`));
      }
      // Track pattern: if same intent+type corrected 3x in 24h → auto-learning
      const patternKey = `correction:${intent}:${(classification.tags || []).sort().join(",")}`;
      trackPattern(patternKey, `Recurring correction on ${intent}: ${classification.summary}`)
        .catch(err => console.error(`[PATTERN] ${err.message}`));
    }

    // Issue detection: check if this entry represents a bug worth filing
    import("./issue-detector.mjs").then(async ({ detectIssue, pushIssueToGitHub }) => {
      const result = await detectIssue(entry);
      if (result.isBug) {
        await pushIssueToGitHub(result.title, result.body);
      }
    }).catch(err => console.error(`[ISSUE] Detection error: ${err.message}`));
  } catch (err) {
    console.error(`[JOURNAL] Capture error: ${err.message}`);
  }
}

/**
 * Auto-create an eval file from a correction.
 * Maps intent/tags to the right agent eval directory.
 */
function createEvalFromCorrection(entry, classification) {
  try {
    const EVALS_DIR = resolve(REPO_ROOT, ".agent/evals");
    const agentDir = detectEvalAgent(entry.intent, classification.tags);
    const evalDir = resolve(EVALS_DIR, agentDir);

    if (!existsSync(evalDir)) mkdirSync(evalDir, { recursive: true });

    // Count existing eval files
    let count = 0;
    try {
      count = readdirSync(evalDir).filter(f => f.endsWith(".md") && f !== "README.md").length;
    } catch { count = 0; }

    const num = String(count + 1).padStart(3, "0");
    const date = new Date().toISOString().split("T")[0];
    const filename = `${num}-${date}-journal.md`;

    const content = `# Eval — ${classification.summary}

**Agent** : ${agentDir}
**Date** : ${date}
**Source** : journal correction (auto-generated)

## Input
${entry.input}

## Bad Output
${entry.output}

## Good Output
[User's corrected version — see conversation]

## Rule
${classification.rule_extracted || "Correction without an explicit extracted rule"}

## Scoring criteria
- [ ] Do not reproduce the error described above
`;

    writeFileSync(resolve(evalDir, filename), content);
    console.log(`[JOURNAL] Eval created: ${agentDir}/${filename}`);
  } catch (err) {
    console.error(`[JOURNAL] Eval creation error: ${err.message}`);
  }
}

/**
 * Detect which agent eval directory to use based on intent and tags.
 * The starter uses a generic "general" bucket — customise per sub-agent
 * (sales, finance, comms, etc.) as you add them.
 */
function detectEvalAgent(intent, tags = []) {
  const text = `${intent} ${tags.join(" ")}`.toLowerCase();
  if (text.includes("code") || text.includes("deploy") || text.includes("ci") || text.includes("git")) return "engineering";
  return "general";
}

/**
 * Apply a correction rule immediately to rules.md.
 * Don't wait for the nightly audit — corrections should take effect NOW.
 */
function applyRuleImmediately(rule, context) {
  try {
    const rules = readFileSync(RULES_PATH, "utf8");

    // Check if rule already exists (fuzzy: check if the core keywords are already there)
    const ruleWords = rule.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const rulesLower = rules.toLowerCase();
    const alreadyExists = ruleWords.length > 0 && ruleWords.every(w => rulesLower.includes(w));

    if (alreadyExists) {
      console.log(`[JOURNAL] Rule already in rules.md, skipping: ${rule}`);
      return;
    }

    const date = new Date().toISOString().split("T")[0];
    const newRule = `- [${date}] ${rule} (source: journal — ${context})\n`;

    // Append to rules.md
    appendFileSync(RULES_PATH, newRule);
    console.log(`[JOURNAL] Rule applied to rules.md: ${rule}`);

    // Invalidate context cache so next message uses the updated rules
    // Dynamic import to avoid circular dependency (context.mjs imports journal.mjs)
    import("./context.mjs").then(m => m.invalidateCache()).catch(() => {});
  } catch (err) {
    console.error(`[JOURNAL] Failed to apply rule: ${err.message}`);
  }
}

/**
 * Load recent journal summaries for injection into the system prompt.
 * Returns a compact string of recent entries.
 *
 * @param {number} days - Number of days to look back
 * @param {number} maxEntries - Max entries to return
 */
export function loadRecentSummaries(days = 3, maxEntries = 15) {
  const entries = [];

  for (let d = 0; d < days; d++) {
    const date = new Date(Date.now() - d * 86400000).toISOString().split("T")[0];
    const filePath = resolve(JOURNAL_DIR, `${date}.jsonl`);

    if (!existsSync(filePath)) continue;

    try {
      const lines = readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          // Skip plain interactions, keep only signals
          if (entry.type !== "interaction") {
            entries.push(entry);
          }
        } catch { /* skip malformed lines */ }
      }
    } catch { /* skip unreadable files */ }
  }

  // Most recent first, limit count
  entries.reverse();
  const selected = entries.slice(0, maxEntries);

  if (selected.length === 0) return "";

  const lines = selected.map(e => {
    const date = e.ts?.substring(0, 10) || "?";
    const icon = { idea: "💡", correction: "🔧", decision: "⚡", task: "📋", reflection: "🧠", context: "📎" }[e.type] || "•";
    const rule = e.rule_extracted ? ` → RULE: ${e.rule_extracted}` : "";
    return `${icon} [${date}] ${e.summary}${rule}`;
  });

  return lines.join("\n");
}

/**
 * Load all extracted rules from recent journal entries.
 * Used by nightly consolidation to merge into rules.md.
 */
export function loadExtractedRules(days = 7) {
  const rules = [];

  for (let d = 0; d < days; d++) {
    const date = new Date(Date.now() - d * 86400000).toISOString().split("T")[0];
    const filePath = resolve(JOURNAL_DIR, `${date}.jsonl`);

    if (!existsSync(filePath)) continue;

    try {
      const lines = readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.rule_extracted) {
            rules.push({ date: entry.ts, rule: entry.rule_extracted, context: entry.summary });
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  return rules;
}
