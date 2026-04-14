import { homedir } from "os";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const expandHome = (p) => p.replace(/^~/, homedir());

// MCP server entry point — path to the shared MCP server factory.
// Point MCP_SERVER_PATH at your `mcp-servers/core/server.mjs` (see docs/mcp-setup.md).
const MCP_SERVER_PATH = process.env.MCP_SERVER_PATH
  || resolve(expandHome("~/.mcp-servers/core/server.mjs"));

// Credential directories — only used for local dev (file-based auth).
function credDir(envVar, localDefault) {
  const val = process.env[envVar] || localDefault;
  return expandHome(val);
}

/**
 * Build env block for an OAuth2 service.
 * Maps SERVICE_PREFIX_* env vars → MCP_AUTH_* for child process.
 * This lets you deploy the bot without shipping credential files —
 * just set the env vars on your host.
 */
function oauth2Env(prefix, credDirEnv, credDirDefault, accountName) {
  const env = {
    MCP_CONFIG_DIR: credDir(credDirEnv, credDirDefault),
    ACCOUNT_NAME: accountName,
  };
  if (process.env[`${prefix}_CLIENT_ID`]) {
    env.MCP_AUTH_CLIENT_ID = process.env[`${prefix}_CLIENT_ID`];
    env.MCP_AUTH_CLIENT_SECRET = process.env[`${prefix}_CLIENT_SECRET`];
    env.MCP_AUTH_REFRESH_TOKEN = process.env[`${prefix}_REFRESH_TOKEN`];
  }
  return env;
}

/**
 * MCP server definitions.
 *
 * This starter ships a generic set of connectors (Gmail, Google Calendar,
 * Notion) that most personal-assistant setups want. Remove or add entries
 * below to match your own stack — the bot picks up whatever is registered
 * here at boot.
 *
 * Local dev: credentials live in ~/.mcp-servers/credentials/<service>/.
 * Hosted deploys: set the env vars listed per entry (e.g. GMAIL_CLIENT_ID).
 *
 * See docs/mcp-setup.md for a step-by-step onboarding guide.
 */
export const MCP_SERVERS = {
  // Gmail — single account by default. Duplicate the entry (e.g. "gmail-work",
  // "gmail-perso") with different env prefixes if you want multiple inboxes.
  "gmail": {
    command: "node",
    args: [MCP_SERVER_PATH, "--service", "gmail"],
    env: oauth2Env("GMAIL", "GMAIL_CREDENTIALS_DIR", "~/.mcp-servers/credentials/gmail", "default"),
  },

  "google-calendar": {
    command: "node",
    args: [MCP_SERVER_PATH, "--service", "google-calendar"],
    env: oauth2Env("GCAL", "GCAL_CREDENTIALS_DIR", "~/.mcp-servers/credentials/google-calendar", "google-calendar"),
  },

  "notion": {
    command: "node",
    args: [MCP_SERVER_PATH, "--service", "notion"],
    env: {
      MCP_CONFIG_DIR: credDir("NOTION_CREDENTIALS_DIR", "~/.mcp-servers/credentials/notion"),
      ACCOUNT_NAME: "notion",
      ...(process.env.NOTION_API_KEY ? { MCP_AUTH_NOTION_TOKEN: process.env.NOTION_API_KEY } : {}),
    },
  },

  // Add your own entries below. Common categories to wire up:
  //   - banking (Qonto, Stripe, Mercury)
  //   - accounting (Pennylane, QuickBooks, Xero)
  //   - CRM (HubSpot, Pipedrive, Salesforce)
  //   - project mgmt (Linear, Jira, Asana)
  //   - public data APIs (DVF/SIRENE/BAN for France, Companies House for UK, etc.)
  // See docs/customize.md for the pattern.
};
