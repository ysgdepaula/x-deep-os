import "dotenv/config";
import { Bot } from "grammy";
import { chat, resetChat } from "./agent.mjs";
import { mcpManager } from "./mcp-manager.mjs";
import { logSkillParity } from "./skills-loader.mjs";
import { splitMessage, markdownToTelegramHTML } from "./utils.mjs";
import { setupCallbackHandler, tryConsumeRejectReason } from "./approvals.mjs";
import { syncRepo } from "./context.mjs";
import { handlePRCommand } from "./pr-notifications.mjs";
import { HELLO_PROMPT } from "./prompts.mjs";

// TODO: wire this up — see docs/customize.md
// The original project also loaded:
//   - cron.mjs              : scheduled tasks (nightly audit, weekly research, ...)
//   - learning-feedback.mjs : Validate/Correct/Ignore inline keyboard for learnings
//   - tasks-sync.mjs        : Notion-driven task reconciliation
//   - core-bridge.mjs       : cross-surface bridge (Telegram ↔ dashboard)
// They're intentionally left out of the starter. Add your own if needed.

const DEEP_NAME = process.env.DEEP_NAME || "X-DEEP";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

const ALLOWED_CHAT_IDS = process.env.ALLOWED_CHAT_IDS?.split(",").map(Number).filter(Boolean) || [];

// === Security: whitelist ===
bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id;
  if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(chatId)) {
    console.log(`[BLOCKED] Chat ID ${chatId}`);
    return;
  }
  console.log(`[MSG] Chat ${chatId} (${ctx.from?.first_name}): ${ctx.message?.text?.substring(0, 50) || "(non-text)"}`);
  await next();
});

// === Inline keyboard handlers ===
setupCallbackHandler(bot);

// === Commands ===
bot.command("start", async (ctx) => {
  await ctx.reply(
    `<b>${DEEP_NAME}</b> 🎯\n\n` +
    `Hi! I'm your executive agent. Here's what I can do:\n\n` +
    `☀️ /hello — Morning briefing\n` +
    `🔄 /reset — Start a fresh conversation\n\n` +
    `Or just chat naturally — I'll route your request to the right skill.\n\n` +
    `<i>Chat ID: ${ctx.chat.id}</i>`,
    { parse_mode: "HTML" }
  );
});

bot.command("reset", async (ctx) => {
  await resetChat(ctx.chat.id);
  await ctx.reply("🔄 Conversation reset.");
});

bot.command("hello", async (ctx) => {
  handleMessage(ctx, HELLO_PROMPT, { intent: "hello" }).catch(console.error);
});

bot.command("briefing", async (ctx) => {
  handleMessage(ctx, HELLO_PROMPT, { intent: "hello" }).catch(console.error);
});

// === Text messages ===
bot.on("message:text", async (ctx) => {
  // Intercept reject reason if pending
  if (tryConsumeRejectReason(ctx.chat.id, ctx.message.text)) return;

  // Intercept PR commands (approve #123, reject #123, details #123)
  const handled = await handlePRCommand(ctx.message.text, bot, ctx.chat.id);
  if (handled) return;

  // Fire-and-forget: frees the polling loop so callback_query updates
  // (approve/reject button clicks) can be received while the agent is running.
  handleMessage(ctx, ctx.message.text).catch(console.error);
});

// === Voice messages ===
bot.on(["message:voice", "message:audio"], async (ctx) => {
  await ctx.replyWithChatAction("typing");
  try {
    const file = await ctx.getFile();
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const audioFile = new File([buffer], "voice.ogg", { type: "audio/ogg" });
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
      language: process.env.WHISPER_LANG || undefined, // auto-detect by default
    });

    const text = transcription.text?.trim();
    if (!text) {
      await ctx.reply("🎙️ Could not transcribe the audio.");
      return;
    }

    await ctx.reply(`🎙️ "${text}"`);
    handleMessage(ctx, text).catch(console.error);
  } catch (err) {
    console.error(`[VOICE ERROR] ${err.message}`);
    await ctx.reply(`❌ Audio error: ${err.message.substring(0, 200)}`);
  }
});

// === Photo messages (Claude Vision) ===
bot.on("message:photo", async (ctx) => {
  await ctx.replyWithChatAction("typing");
  try {
    // Get highest resolution photo
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1];
    const file = await ctx.api.getFile(photo.file_id);
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString("base64");

    // Get caption or default prompt
    const caption = ctx.message.caption || "Analyse this image.";

    // Build multimodal message
    const multimodalContent = [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
      { type: "text", text: caption },
    ];

    // Send directly through chat with image content
    handleMessage(ctx, multimodalContent).catch(console.error);
  } catch (err) {
    console.error(`[PHOTO ERROR] ${err.message}`);
    await ctx.reply(`❌ Photo error: ${err.message.substring(0, 200)}`);
  }
});

// === Status messages (thinking/vibing) ===
const STATUS_MESSAGES = [
  "thinking...",
  "searching...",
  "analysing...",
  "looking at this...",
  "one moment...",
  "digging in...",
  "processing...",
  "on it...",
  "working on it...",
  "loading...",
];

const STATUS_UPDATES = [
  "still here, digging deeper...",
  "almost there...",
  "compiling it all...",
  "one more moment...",
  "patience, this one's chunky...",
  "synthesising...",
  "final check...",
  "coming together...",
];

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// === Main handler ===
async function handleMessage(ctx, text, { intent } = {}) {
  const chatId = ctx.chat.id;
  await ctx.replyWithChatAction("typing");

  // Send a status message that we'll update while thinking
  let statusMsg;
  try {
    statusMsg = await ctx.reply(`⏳ ${randomPick(STATUS_MESSAGES)}`);
  } catch { /* ignore if status fails */ }

  // Rotate status every 4-6s while waiting
  let statusInterval;
  if (statusMsg) {
    let tick = 0;
    statusInterval = setInterval(async () => {
      tick++;
      try {
        await ctx.replyWithChatAction("typing");
        const msg = tick >= 3 ? randomPick(STATUS_UPDATES) : randomPick(STATUS_MESSAGES);
        await ctx.api.editMessageText(chatId, statusMsg.message_id, `⏳ ${msg}`);
      } catch { /* edit can fail if msg was already deleted */ }
    }, 4000 + Math.random() * 2000);
  }

  try {
    const response = await chat(chatId, text, { bot, intent });

    // Delete status message
    if (statusInterval) clearInterval(statusInterval);
    if (statusMsg) {
      try { await ctx.api.deleteMessage(chatId, statusMsg.message_id); } catch {}
    }

    const html = markdownToTelegramHTML(response);
    const chunks = splitMessage(html, 4000);
    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      } catch {
        await ctx.reply(chunk);
      }
    }
  } catch (err) {
    if (statusInterval) clearInterval(statusInterval);
    if (statusMsg) {
      try { await ctx.api.deleteMessage(chatId, statusMsg.message_id); } catch {}
    }
    console.error(`[ERROR] ${err.message}`);
    await ctx.reply(`❌ Error: ${err.message.substring(0, 200)}`);
  }
}

// === Error handler ===
bot.catch((err) => {
  console.error(`[BOT ERROR] ${err.message}`);
});

// === Startup ===
async function start() {
  console.log(`🤖 ${DEEP_NAME} — starting...`);

  // Sync repo (for hosted deploys that pull CLAUDE.md + .agent/ from git)
  await syncRepo();

  // Load + log the skill inventory (.claude/skills) for Telegram parity
  logSkillParity();

  // Set journal feedback target for learning proposals
  const CHAT_ID = process.env.ALLOWED_CHAT_IDS?.split(",").map(Number).filter(Boolean)[0];
  if (CHAT_ID) {
    import("./journal.mjs").then(({ setFeedbackTarget }) => setFeedbackTarget(bot, CHAT_ID)).catch(() => {});
  }

  // Connect to all MCP servers
  await mcpManager.connect();

  // TODO: wire this up — see docs/customize.md
  // Start your scheduled tasks here (import { startCron } from "./cron.mjs";)

  // Start bot
  bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Bot @${botInfo.username} connected`);
      console.log(`   Allowed chat IDs: ${ALLOWED_CHAT_IDS.length ? ALLOWED_CHAT_IDS.join(", ") : "ALL"}`);
      console.log(`   MCP tools: ${mcpManager.getAnthropicTools().length}`);
    },
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n🛑 Shutdown...");
    await mcpManager.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
