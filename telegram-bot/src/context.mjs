import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { loadRecentSummaries } from "./journal.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.REPO_PATH || resolve(__dirname, "../..");

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let _cache = null;
let _cacheTime = 0;

// ── Upstash Redis Event Bus ─────────────────────────────
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const STREAM_KEY = process.env.REDIS_EVENTS_STREAM || "xdeep:events";

async function redisCmd(command) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const res = await fetch(UPSTASH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) return null;
    const { result } = await res.json();
    return result;
  } catch {
    return null;
  }
}

/**
 * Read recent events from Redis Streams.
 * Returns formatted string for system prompt injection.
 */
async function loadRealtimeEvents(count = 15) {
  const raw = await redisCmd(["XREVRANGE", STREAM_KEY, "+", "-", "COUNT", String(count)]);
  if (!raw || !Array.isArray(raw) || raw.length === 0) return "";
  const events = raw.reverse().map(([, fields]) => {
    const obj = {};
    for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
    return obj;
  });
  return events
    .map((e) => `- [${e.ts?.slice(11, 16) || "??"}] ${e.surface} | ${e.type} | ${e.summary}`)
    .join("\n");
}

/**
 * Publish an event to Redis Streams.
 */
export async function publishEvent({ surface = "telegram", type = "action", summary = "", intent = "" }) {
  const ts = new Date().toISOString();
  await redisCmd([
    "XADD", STREAM_KEY, "MAXLEN", "~", "1000", "*",
    "surface", surface,
    "type", type,
    "summary", summary,
    "intent", intent,
    "ts", ts,
  ]);
}

function tryRead(path) {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}

function lastNLines(text, n) {
  const lines = text.split("\n");
  return lines.slice(-n).join("\n");
}

/**
 * Load the N most recent session handoff files from .agent/sessions/
 * Returns concatenated content of the latest handoffs (all surfaces).
 */
function loadRecentHandoffs(n = 3) {
  const sessionsDir = resolve(REPO_ROOT, ".agent/sessions");
  try {
    const files = execSync(`ls -t "${sessionsDir}"/*.md 2>/dev/null | head -${n}`, {
      encoding: "utf8",
      timeout: 5000,
    }).trim().split("\n").filter(Boolean);
    return files.map(f => tryRead(f)).filter(Boolean).join("\n---\n");
  } catch {
    return "";
  }
}

/**
 * Load context files from the repo: CLAUDE.md, rules, queue, changelog.
 * Cached with 5 min TTL to avoid re-reading on every message.
 */
export async function loadContext() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;

  // Load real-time events from Redis (non-blocking, falls back to empty)
  const realtimeEvents = await loadRealtimeEvents(15);

  _cache = {
    claudeMd: tryRead(resolve(REPO_ROOT, "CLAUDE.md")),
    rules: tryRead(resolve(REPO_ROOT, ".agent/rules.md")),
    queue: tryRead(resolve(REPO_ROOT, ".agent/queue.md")),
    changelog: lastNLines(tryRead(resolve(REPO_ROOT, ".agent/changelog.md")), 20),
    realtimeEvents,
    knowledge: tryRead(resolve(REPO_ROOT, ".agent/knowledge/index.md")),
    journal: loadRecentSummaries(3, 15),
    sessionHandoffs: loadRecentHandoffs(3),
  };
  _cacheTime = now;
  return _cache;
}

/**
 * Sync repo from remote (for hosted deployments like Railway/Fly/Render).
 * First call: clone the repo (sparse checkout — only .agent/ and CLAUDE.md).
 * Subsequent calls: git pull to refresh.
 *
 * Requires env vars:
 *   GITHUB_TOKEN       — PAT with repo read access (for private repos)
 *   GITHUB_REPO_URL    — full https URL to the repo, e.g. https://github.com/<owner>/<repo>.git
 */
export async function syncRepo() {
  const token = process.env.GITHUB_TOKEN;
  const baseUrl = process.env.GITHUB_REPO_URL;
  if (!baseUrl) {
    console.log("[SYNC] GITHUB_REPO_URL not set — skipping remote sync (running from local checkout).");
    return;
  }
  // If token available, inject into URL for private repo access
  const REPO_URL = token ? baseUrl.replace("https://", `https://${token}@`) : baseUrl;

  try {
    // Check if repo already cloned
    if (!existsSync(resolve(REPO_ROOT, ".git"))) {
      console.log(`[SYNC] Cloning repo into ${REPO_ROOT}...`);
      // Remove existing dir if it exists without .git (created by journal.mjs mkdirSync)
      if (existsSync(REPO_ROOT)) {
        execSync(`rm -rf ${REPO_ROOT}`, { timeout: 10000 });
      }
      execSync(`git clone --depth 1 --filter=blob:none --sparse ${REPO_URL} ${REPO_ROOT}`, {
        timeout: 60000,
        encoding: "utf8",
      });
      // Only checkout the files we need (context + journal)
      execSync("git sparse-checkout set --no-cone .agent /CLAUDE.md .claude/skills .agent/sessions", {
        cwd: REPO_ROOT,
        timeout: 30000,
        encoding: "utf8",
      });
      console.log(`[SYNC] Repo cloned (sparse: .agent/, CLAUDE.md, .claude/skills/)`);
    } else {
      // Re-apply sparse-checkout paths idempotently — required when
      // upgrading an existing instance cloned before new paths were added.
      try {
        execSync("git sparse-checkout set --no-cone .agent /CLAUDE.md .claude/skills .agent/sessions", {
          cwd: REPO_ROOT,
          timeout: 30000,
          encoding: "utf8",
        });
      } catch (e) {
        console.warn(`[SYNC] sparse-checkout refresh failed: ${e.message}`);
      }
      const result = execSync("git pull origin main", {
        cwd: REPO_ROOT,
        timeout: 30000,
        encoding: "utf8",
      });
      console.log(`[SYNC] ${result.trim()}`);
    }
    _cache = null; // invalidate cache after sync
  } catch (err) {
    console.warn(`[SYNC] sync failed: ${err.message}`);
  }
}

/**
 * Invalidate the context cache (e.g. after a known change).
 */
export function invalidateCache() {
  _cache = null;
  _cacheTime = 0;
}
