import { InlineKeyboard } from "grammy";
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

// TODO: wire this up — see docs/customize.md
// The original project persisted rejections to a Redis-backed learning
// buffer so patterns could be replayed by a nightly audit. The starter
// ships with a no-op stub; swap it for your own persistence if you want
// the feedback loop (or keep as-is — changelog.md + state.json still
// capture every decision locally).
const saveLearning = async () => {};

const REPO_ROOT = process.env.REPO_PATH || resolve(import.meta.dirname || ".", "../..");
const CHANGELOG_PATH = resolve(REPO_ROOT, ".agent/changelog.md");
const STATE_PATH = resolve(REPO_ROOT, ".agent/state.json");
const FILTER_LOG_PATH = resolve(REPO_ROOT, ".agent/memory-filter-log.jsonl");

// Tools that ALWAYS require user approval.
// Edit this list to match the MCP tools you've wired up.
const HIGH_RISK_SUFFIXES = [
  "send_email", "send_draft",
  "gcal_create_event", "gcal_delete_event", "gcal_update_event",
  "notion_create_pages", "notion_update_page", "notion_move_pages",
];

// bash_execute: read-only commands are safe, others need approval.
const SAFE_BASH_PREFIXES = ["git", "ls", "cat", "head", "tail", "grep", "find", "date", "wc", "pwd", "echo", "node -e", "npm list"];

// Pending approval requests: callbackId → { resolve, timeout, args }
const pending = new Map();
// Pending reject reason capture: chatId → { resolve, timeout }
const pendingRejectReasons = new Map();
let nextId = 1;

/**
 * Check if a tool call requires approval.
 */
export function isHighRisk(toolName, args = {}) {
  const baseName = toolName.includes("__") ? toolName.split("__").pop() : toolName;

  // bash_execute: check if the command is read-only
  if (baseName === "bash_execute" && args.command) {
    const cmd = args.command.trim();
    const firstWord = cmd.split(/\s+/)[0];
    return !SAFE_BASH_PREFIXES.some(p => cmd.startsWith(p) || firstWord === p);
  }

  return HIGH_RISK_SUFFIXES.includes(baseName);
}

/** Escape HTML special chars for Telegram HTML parse_mode */
function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatActionSummary(toolName, args) {
  const baseName = toolName.includes("__") ? toolName.split("__").pop() : toolName;
  const server = toolName.includes("__") ? toolName.split("__")[1] : "";

  switch (baseName) {
    case "send_email":
    case "send_draft":
      return `📧 <b>Email</b> via ${esc(server)}\n\n` +
        `<b>To:</b> ${esc(args.to || args.recipient || "?")}\n` +
        `<b>Subject:</b> ${esc(args.subject || "(draft)")}\n` +
        (args.body ? `<b>Preview:</b> ${esc(String(args.body).substring(0, 150))}...` : "");
    case "gcal_create_event":
      return `📅 <b>Create event</b>\n\n` +
        `<b>Title:</b> ${esc(args.summary || "?")}\n` +
        `<b>Date:</b> ${esc(args.start || "?")}`;
    case "gcal_delete_event":
      return `📅 <b>Delete event</b>\n\n` +
        `<b>ID:</b> ${esc(args.eventId || args.event_id || "?")}`;
    case "gcal_update_event":
      return `📅 <b>Update event</b>\n\n` +
        `<b>ID:</b> ${esc(args.eventId || args.event_id || "?")}`;
    case "notion_create_pages":
      return `📝 <b>Create Notion page</b>\n\n` +
        `<b>Content:</b> ${esc(args.title || JSON.stringify(args).substring(0, 100))}`;
    case "notion_update_page":
      return `📝 <b>Update Notion page</b>\n\n` +
        `<b>Page:</b> ${esc(args.pageId || args.page_id || "?")}`;
    case "bash_execute":
      return `💻 <b>Shell command</b>\n\n` +
        `<code>${esc(args.command || "?")}</code>`;
    default:
      return `🔧 <b>${esc(baseName)}</b>\n\n${esc(JSON.stringify(args).substring(0, 200))}`;
  }
}

/**
 * Request user approval via Telegram inline keyboard.
 * Returns a Promise that resolves to true (approved) or false (rejected).
 * Auto-rejects after 5 minutes.
 */
const THINKING_MESSAGES = [
  "preparing the action...",
  "verifying...",
  "checking before executing...",
  "analysing the action...",
  "one moment, preparing this...",
];

export async function requestApproval(bot, chatId, toolName, args) {
  const callbackId = `approve_${nextId++}`;
  const summary = formatActionSummary(toolName, args);

  // Send thinking message first
  const thinking = THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)];
  const thinkingMsg = await bot.api.sendMessage(chatId, `⏳ ${thinking}`);

  // Small delay so the user sees the thinking step
  await new Promise(r => setTimeout(r, 1200));

  // Delete thinking, show the approval request
  try { await bot.api.deleteMessage(chatId, thinkingMsg.message_id); } catch {}

  const keyboard = new InlineKeyboard()
    .text("✅ Approve", `${callbackId}_yes`)
    .text("❌ Reject", `${callbackId}_no`)
    .row()
    .text("📋 Details", `${callbackId}_details`);

  await bot.api.sendMessage(chatId, `⚠️ <b>Action to approve</b>\n\n${summary}`, {
    reply_markup: keyboard,
    parse_mode: "HTML",
  });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pending.delete(callbackId);
      resolve(false); // auto-reject after 5 min
    }, 5 * 60 * 1000);

    pending.set(callbackId, { resolve, timeout, args });
  });
}

/**
 * Setup the callback query handler on the bot.
 * Call this once during bot initialization.
 */
export function setupCallbackHandler(bot) {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Find matching pending approval
    for (const [callbackId, entry] of pending) {
      // Details button — show full args without resolving
      if (data === `${callbackId}_details`) {
        const details = entry.args ? JSON.stringify(entry.args, null, 2).substring(0, 3000) : "(no details)";
        await ctx.answerCallbackQuery({ text: "Details below" });
        await bot.api.sendMessage(ctx.chat.id, `📋 Full details:\n\n${details}`);
        return;
      }

      if (data === `${callbackId}_yes` || data === `${callbackId}_no`) {
        const { resolve, timeout } = entry;
        clearTimeout(timeout);
        pending.delete(callbackId);

        const approved = data.endsWith("_yes");
        const isMemo = callbackId.startsWith("memo_");

        await ctx.answerCallbackQuery({
          text: approved
            ? (isMemo ? "✅ Saved" : "✅ Approved")
            : (isMemo ? "❌ Ignored" : "❌ Rejected"),
        });

        // Edit the original message to show the decision
        try {
          const original = ctx.callbackQuery.message?.text || "";
          const label = isMemo
            ? (approved ? "✅ SAVED" : "❌ IGNORED")
            : (approved ? "✅ APPROVED" : "❌ REJECTED");
          await ctx.editMessageText(`${original}\n\n→ ${label}`);
        } catch { /* ignore edit errors */ }

        // Log to changelog + update stats (skip for memo — handled by its own logger)
        if (!isMemo) {
          logApprovalDecision(callbackId, approved, ctx.callbackQuery.message?.text);

          // On rejection, ask for reason and save as learning
          if (!approved) {
            const chatId = ctx.chat.id;
            await bot.api.sendMessage(chatId, "Why? (one line, or reply 'ignore')", { parse_mode: "HTML" });

            // Wait for next text message as the reason (2min timeout)
            const reasonPromise = new Promise((resolveReason) => {
              const rejectTimeout = setTimeout(() => {
                resolveReason(null);
              }, 120_000);

              pendingRejectReasons.set(chatId, { resolve: resolveReason, timeout: rejectTimeout });
            });

            const reason = await reasonPromise;
            pendingRejectReasons.delete(chatId);

            const actionSummary = ctx.callbackQuery.message?.text || "unknown action";
            saveLearning({
              type: "rejection",
              context: actionSummary.substring(0, 300),
              correction: reason || "(rejected without reason)",
              rule: reason ? `Do not: ${reason}` : null,
            }).catch(err => console.error(`[LEARN] ${err.message}`));
          }
        }

        resolve(approved);
        return;
      }
    }

    // Unknown callback — expired or lost after restart
    await ctx.answerCallbackQuery({ text: "⏰ Action expired (redeploy). Ask me again." });
    try {
      const original = ctx.callbackQuery.message?.text || "";
      await ctx.editMessageText(`${original}\n\n→ ⏰ EXPIRED (bot restarted)`);
    } catch { /* ignore edit errors */ }
  });
}

/**
 * Request a decision on memorizing a signal via inline keyboard.
 * Returns a Promise that resolves to true (memorize) or false (ignore).
 * Auto-ignores after 10 minutes.
 */
export async function requestMemorization(bot, chatId, { summary, source, vertical, score }) {
  const callbackId = `memo_${nextId++}`;

  const keyboard = new InlineKeyboard()
    .text("✅ Save", `${callbackId}_yes`)
    .text("❌ Ignore", `${callbackId}_no`);

  await bot.api.sendMessage(
    chatId,
    `📝 *Signal detected*\n\n${summary}\nSource: ${source}\nVertical: ${vertical}`,
    { reply_markup: keyboard },
  );

  return new Promise((resolvePromise) => {
    const timeout = setTimeout(() => {
      pending.delete(callbackId);
      logMemorizationDecision({ summary, source, vertical, score, decision: "timeout" });
      resolvePromise(false);
    }, 10 * 60 * 1000);

    pending.set(callbackId, {
      resolve: (approved) => {
        logMemorizationDecision({ summary, source, vertical, score, decision: approved ? "memorize" : "ignore" });
        resolvePromise(approved);
      },
      timeout,
    });
  });
}

/**
 * Log memorization decision to the filter learning log.
 */
function logMemorizationDecision({ summary, source, vertical, score, decision }) {
  const entry = {
    date: new Date().toISOString().split("T")[0],
    signal_type: source.includes("gmail") ? "email" : source.includes("calendar") ? "calendar" : "conversation",
    source,
    summary: (summary || "").substring(0, 200),
    decision,
    vertical: vertical || "core",
    score: score || 0,
  };
  try {
    appendFileSync(FILTER_LOG_PATH, JSON.stringify(entry) + "\n");
    console.log(`[MEMO] ${decision.toUpperCase()}: ${entry.summary.substring(0, 50)}`);
  } catch { /* filter log might not exist yet — will be created on first write */ }
}

/**
 * Check if a text message is a pending reject reason.
 * Called from index.mjs before the normal message handler.
 * @returns {boolean} true if the message was consumed as a reject reason
 */
export function tryConsumeRejectReason(chatId, text) {
  const entry = pendingRejectReasons.get(chatId);
  if (!entry) return false;
  clearTimeout(entry.timeout);
  entry.resolve(text);
  pendingRejectReasons.delete(chatId);
  return true;
}

/**
 * Detect which agent is responsible for this action based on context.
 * Heuristic fallback — override with your own sub-agent taxonomy by
 * editing the keyword map. Returns a default agent id if nothing matches.
 */
function detectAgent(messageText) {
  const defaultAgent = process.env.DEFAULT_AGENT_ID || "master";
  const text = (messageText || "").toLowerCase();
  if (text.includes("gmail") || text.includes("email")) return "comms";
  if (text.includes("invoice") || text.includes("expense") || text.includes("bank")) return "finance";
  if (text.includes("linkedin") || text.includes("slide") || text.includes("presentation")) return "comms";
  if (text.includes("gcal_") || text.includes("calendar") || text.includes("event")) return defaultAgent;
  if (text.includes("notion_create") || text.includes("notion_update")) return defaultAgent;
  return defaultAgent;
}

/**
 * Log approval/rejection to changelog.md and update agent stats in state.json.
 */
function logApprovalDecision(callbackId, approved, messageText) {
  const date = new Date().toISOString().split("T")[0];
  const time = new Date().toISOString().split("T")[1].substring(0, 5);
  const action = (messageText || "unknown action").substring(0, 100).replace(/\n/g, " ");
  const verdict = approved ? "APPROVED" : "REJECTED";

  // Append to changelog
  try {
    appendFileSync(CHANGELOG_PATH, `- [${date} ${time}] [approval] ${verdict} — ${action}\n`);
    console.log(`[APPROVAL] ${verdict}: ${action.substring(0, 50)}`);
  } catch { /* changelog might not exist yet */ }

  // Update stats in state.json (if present)
  try {
    if (!existsSync(STATE_PATH)) return;
    const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    const agentId = detectAgent(messageText);
    const agent = state.agents?.[agentId];
    if (agent?.stats) {
      agent.stats.total = (agent.stats.total || 0) + 1;
      if (approved) agent.stats.approved = (agent.stats.approved || 0) + 1;
      else agent.stats.rejected = (agent.stats.rejected || 0) + 1;

      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
      console.log(`[STATS] ${agentId}: ${agent.stats.total} total, ${agent.stats.approved} approved, ${agent.stats.rejected} rejected`);
    }
  } catch { /* state.json might not be available */ }
}
