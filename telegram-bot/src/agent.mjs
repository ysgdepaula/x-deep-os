import { generateText, jsonSchema } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { mcpManager } from "./mcp-manager.mjs";
import { CUSTOM_TOOLS, CUSTOM_HANDLERS } from "./tools/custom.mjs";
import { isHighRisk, requestApproval } from "./approvals.mjs";
import { buildSystemPrompt, detectIntent } from "./system-prompt.mjs";
import { capture as journalCapture } from "./journal.mjs";
import { publishEvent } from "./context.mjs";

/* ═══════════════════════════════════════════════════════════════
   Agent — Vercel AI SDK (provider-agnostic)
   Switch provider via env: AI_PROVIDER=anthropic|openai
   Switch model via env: AI_MODEL=claude-sonnet-4-6|gpt-4o|etc.
   ═══════════════════════════════════════════════════════════════ */

// ── Patch: @ai-sdk/anthropic v3.x destroys tool input_schema ──
// The provider replaces full schemas with { properties: {}, additionalProperties: false },
// stripping type, actual properties, required fields, etc.
// Workaround: store original schemas before generateText, re-inject in fetch.
// Remove when @ai-sdk/anthropic fixes this upstream.
const _originalSchemas = new Map(); // tool name → original input_schema

/**
 * Call this before generateText() to snapshot tool schemas.
 */
export function snapshotToolSchemas(tools) {
  _originalSchemas.clear();
  for (const [name, def] of Object.entries(tools)) {
    const schema = def.parameters?.jsonSchema;
    if (schema) _originalSchemas.set(name, schema);
  }
}

const _origFetch = globalThis.fetch;
globalThis.fetch = async (url, opts, ...rest) => {
  if (opts?.body && typeof url === "string" && url.includes("anthropic.com")) {
    try {
      const body = JSON.parse(opts.body);
      if (Array.isArray(body.tools)) {
        for (const tool of body.tools) {
          // Re-inject the full original schema that the provider destroyed
          const original = _originalSchemas.get(tool.name);
          if (original) {
            tool.input_schema = original;
          } else if (tool.input_schema && !tool.input_schema.type) {
            // Fallback: at least add type
            tool.input_schema.type = "object";
          }
        }
        opts = { ...opts, body: JSON.stringify(body) };
      }
    } catch { /* not JSON or no tools — pass through */ }
  }
  return _origFetch(url, opts, ...rest);
};

// ── Provider registry ──
const providers = {
  anthropic: () => createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  openai: () => createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
};

function getModel() {
  const providerName = process.env.AI_PROVIDER || "anthropic";
  const modelId = process.env.AI_MODEL || "claude-sonnet-4-6";
  const factory = providers[providerName];
  if (!factory) throw new Error(`Unknown AI provider: ${providerName}. Use: ${Object.keys(providers).join(", ")}`);
  return factory()(modelId);
}

// ── Conversation memory (per chat, Redis-backed) ──
const conversations = new Map(); // in-memory cache, synced to Redis
const MAX_HISTORY = 50;

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_PREFIX = process.env.REDIS_PREFIX || "xdeep";

async function redisCmd(command) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const res = await fetch(UPSTASH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    if (!res.ok) return null;
    const { result } = await res.json();
    return result;
  } catch { return null; }
}

function chatKey(chatId) { return `${REDIS_PREFIX}:chat:${chatId}`; }

async function getHistory(chatId) {
  if (conversations.has(chatId)) return conversations.get(chatId);

  // Try loading from Redis on first access (survives restarts)
  const raw = await redisCmd(["GET", chatKey(chatId)]);
  const history = raw ? JSON.parse(raw) : [];
  conversations.set(chatId, history);
  return history;
}

async function addToHistory(chatId, role, content) {
  const history = await getHistory(chatId);
  history.push({ role, content });
  // Trim oldest messages if over limit
  while (history.length > MAX_HISTORY) history.shift();
  // Persist to Redis (fire-and-forget, 7 day TTL)
  redisCmd(["SET", chatKey(chatId), JSON.stringify(history), "EX", "604800"])
    .catch(() => {});
}

async function deleteHistory(chatId) {
  conversations.delete(chatId);
  await redisCmd(["DEL", chatKey(chatId)]).catch(() => {});
}

/**
 * Normalize user content to AI SDK format.
 * Handles text strings and multimodal arrays (photos).
 */
function normalizeUserContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content);

  // Convert Anthropic multimodal format → AI SDK format
  return content.map((block) => {
    if (block.type === "text") return { type: "text", text: block.text };
    if (block.type === "image" && block.source?.type === "base64") {
      return { type: "image", image: block.source.data, mimeType: block.source.media_type };
    }
    return { type: "text", text: JSON.stringify(block) };
  });
}

// ── Tool execution ──

async function executeTool(name, input) {
  if (mcpManager.isMcpTool(name)) {
    return await mcpManager.callTool(name, input);
  }
  const handler = CUSTOM_HANDLERS[name];
  if (handler) {
    const result = await handler(input);
    return typeof result === "string" ? result : JSON.stringify(result);
  }
  throw new Error(`Unknown tool: ${name}`);
}

/**
 * Build AI SDK tools from MCP + custom tools.
 * Wraps each tool with approval check (closes over chatId, bot).
 */
function buildAITools(chatId, bot, intent) {
  const mcpTools = mcpManager.getToolsForIntent(intent);
  const allTools = [...mcpTools, ...CUSTOM_TOOLS];
  const tools = {};

  for (const t of allTools) {
    // Ensure input_schema always has type:"object" — some MCP tools omit it
    const schema = t.input_schema && typeof t.input_schema === "object"
      ? { type: "object", properties: {}, ...t.input_schema }
      : { type: "object", properties: {} };
    tools[t.name] = {
      description: t.description,
      parameters: jsonSchema(schema),
      execute: async (params) => {
        // High-risk approval check
        if (bot && isHighRisk(t.name, params)) {
          const approved = await requestApproval(bot, chatId, t.name, params);
          if (!approved) return "Action rejected by user.";
        }
        try {
          const result = await executeTool(t.name, params);
          return result || "(empty tool result)";
        } catch (err) {
          return `Error ${t.name}: ${err.message}`;
        }
      },
    };
  }
  return tools;
}

/**
 * Send a message to the LLM and handle tool calls automatically.
 * Provider-agnostic via Vercel AI SDK.
 */
export async function chat(chatId, userMessage, { bot, intent: forceIntent } = {}) {
  const normalizedContent = normalizeUserContent(userMessage);
  await addToHistory(chatId, "user", normalizedContent);

  const intent = forceIntent || (typeof userMessage === "string" ? detectIntent(userMessage) : "general");
  const systemPrompt = await buildSystemPrompt(intent);
  const tools = buildAITools(chatId, bot, intent);
  const history = await getHistory(chatId);

  const toolCount = Object.keys(tools).length;
  console.log(`[INTENT] "${intent}" → ${toolCount} tools`);

  // Snapshot schemas before generateText — the provider will destroy them
  snapshotToolSchemas(tools);

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await generateText({
        model: getModel(),
        system: systemPrompt,
        messages: history,
        tools,
        maxSteps: 15,
        // Anthropic prompt caching: system + tools cached automatically
      });

      // Log usage
      if (result.usage) {
        console.log(`[TOKENS] in=${result.usage.promptTokens} out=${result.usage.completionTokens}`);
      }
      const lastStep = result.steps?.[result.steps.length - 1];
      console.log(`[STEPS] ${result.steps?.length || 0} steps, text=${!!result.text}, finishReason=${lastStep?.finishReason}, toolCalls=${result.steps?.filter(s => s.toolCalls?.length).length || 0}`);

      let finalText = result.text;

      // Workaround: @ai-sdk/anthropic v3.x stops after step 1 even when
      // finishReason=tool-calls and tools were executed. Manually continue
      // with tool results if the model hasn't given a real answer.
      const hasToolResults = result.steps?.some(s => s.toolResults?.length > 0);
      const isPlaceholderText = finalText && finalText.length < 200 && hasToolResults;

      if ((lastStep?.finishReason === "tool-calls" || isPlaceholderText) && hasToolResults) {
        console.log(`[STEP2] SDK stopped after tool calls — manually continuing with tool results`);

        const toolSummaries = [];
        for (const step of result.steps || []) {
          for (const tr of step.toolResults || []) {
            const raw = tr.result ?? tr.output ?? "";
            const val = typeof raw === "string" ? raw : JSON.stringify(raw);
            if (val) toolSummaries.push(`[${tr.toolName || "tool"}]: ${val.substring(0, 4000)}`);
          }
        }
        const toolContext = toolSummaries.join("\n\n");

        const originalRequest = typeof userMessage === "string" ? userMessage : "the previous request";
        const followUpMessages = [
          ...history,
          { role: "assistant", content: finalText || "Searching for information..." },
          { role: "user", content: `Here are your tool results. Now FULLY answer my original request ("${originalRequest}") using this data. Be detailed and well-structured. Telegram format (bold, emojis, lists — NO MD tables, NO ## headers).\n\n${toolContext}` },
        ];

        try {
          const step2 = await generateText({
            model: getModel(),
            system: systemPrompt,
            messages: followUpMessages,
            maxSteps: 1, // no more tools, just synthesize
          });
          if (step2.text && step2.text.length > finalText?.length) {
            console.log(`[STEP2] Got synthesized text (${step2.text.length} chars)`);
            finalText = step2.text;
          }
        } catch (err) {
          console.error(`[STEP2] Error: ${err.message?.substring(0, 200)}`);
        }
      }

      if (!finalText) finalText = "(No response)";
      await addToHistory(chatId, "assistant", finalText);

      // Journal capture (fire-and-forget)
      journalCapture({ channel: "telegram", chatId, intent, input: userMessage, output: finalText })
        .catch(err => console.error(`[JOURNAL] ${err.message}`));

      // Publish event to Redis (fire-and-forget) — skip noise
      const hasToolCalls = result.steps?.some(s => s.toolCalls?.length > 0);
      if (hasToolCalls || finalText.length > 200) {
        const toolNames = result.steps
          ?.flatMap(s => s.toolCalls || [])
          .map(t => t.toolName)
          .filter(Boolean);
        const summary = toolNames?.length
          ? `[${intent}] Used ${toolNames.join(", ")}`
          : `[${intent}] ${finalText.slice(0, 120)}`;
        publishEvent({ surface: "telegram", type: "action", summary, intent })
          .catch(err => console.error(`[EVENT-BUS] ${err.message}`));
      }

      return finalText;
    } catch (err) {
      lastError = err;
      // Rate limit retry
      if (err.statusCode === 429 && attempt < 2) {
        const wait = (attempt + 1) * 10;
        console.log(`[RATE LIMIT] Attempt ${attempt + 1}/3 — waiting ${wait}s...`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Reset conversation history for a chat.
 */
export async function resetChat(chatId) {
  await deleteHistory(chatId);
}
