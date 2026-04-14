# X-DEEP OS — MCP Server Framework

A modular factory for building MCP (Model Context Protocol) servers that expose tools to your AI agent. Each service lives in its own folder with a `config.json` + `tools.mjs`. The core factory (`core/server.mjs`) handles the MCP protocol, credential loading, and tool routing.

## Why this matters

MCP is how Claude (and other LLMs) call external APIs — Gmail, Notion, Stripe, your DB, anything. Rather than running one MCP server per service with its own boilerplate, this framework uses a single factory that loads services dynamically. Adding a new service takes 10 minutes.

## Structure

```
mcp-servers/
├── core/
│   ├── server.mjs          ← the factory: starts an MCP server for one service
│   └── auth/
│       └── oauth2.mjs      ← OAuth2 helper (reused across services)
├── services/
│   ├── gmail/              ← Gmail (OAuth2 + Google APIs)
│   │   ├── config.json
│   │   └── tools.mjs
│   └── example-service/    ← starter template
│       ├── config.json
│       └── tools.mjs
├── credentials/            ← OAuth tokens (gitignored)
│   └── <service>/
│       └── token.json
├── scripts/
│   └── add-service.mjs     ← scaffolds a new service
└── package.json
```

## Quick start

### Install
```bash
cd mcp-servers
npm install
```

### Add a new service
```bash
node scripts/add-service.mjs <service-name>
# e.g. node scripts/add-service.mjs notion
```
This copies `services/example-service/` under your chosen name. Edit the new `tools.mjs` to implement your API calls.

### Run a service as a standalone MCP server
```bash
node core/server.mjs --service gmail
```

### Register in Claude Code
In your `.claude.json` or `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-servers/core/server.mjs", "--service", "gmail"],
      "env": {
        "MCP_CONFIG_DIR": "/absolute/path/to/mcp-servers",
        "ACCOUNT_NAME": "work"
      }
    }
  }
}
```

### Multiple accounts for the same service
The `ACCOUNT_NAME` env var lets you run multiple copies of a service against different credentials. For example, Gmail with three accounts:

```json
{
  "mcpServers": {
    "gmail-work":     { "env": { "ACCOUNT_NAME": "work" } },
    "gmail-outbound": { "env": { "ACCOUNT_NAME": "outbound" } },
    "gmail-personal": { "env": { "ACCOUNT_NAME": "personal" } }
  }
}
```

Each account has its own credentials folder at `credentials/gmail-<account>/`.

## Writing a service

A service is a folder with two files:

**`config.json`** — metadata
```json
{
  "name": "my-service",
  "description": "What this service does",
  "requiredEnv": ["MCP_CONFIG_DIR"],
  "optionalEnv": ["ACCOUNT_NAME"],
  "authType": "oauth2 | apikey | none",
  "tools": ["tool_name_1", "tool_name_2"]
}
```

**`tools.mjs`** — exports the tools and optional hooks
```js
export const tools = [
  {
    name: "tool_name",
    description: "What this tool does",
    inputSchema: { /* JSON schema */ },
    handler: async (input, state) => { /* return { content: [...] } */ }
  }
];

export async function init(config) { /* setup */ }
export async function preHook(toolName, input, state) { /* per-call validation */ }
```

See `services/example-service/tools.mjs` for a working minimal example, and `services/gmail/tools.mjs` for a real-world OAuth2 service.

## Credentials

The `credentials/` folder is gitignored. Each service stores its credentials there under a subfolder matching `<service-name>` or `<service-name>-<account-name>`.

See `credentials/README.md` for the expected file formats.

## Why not the Anthropic MCP SDK directly?

You can use the SDK directly — nothing here prevents that. This framework is an opinionated layer on top that:
- Standardizes credential handling (`credentials/<service>/`)
- Centralizes auth flows (`core/auth/oauth2.mjs`)
- Lets multiple services share one runtime via `--service` flag
- Makes "add a new service" a 10-minute task instead of an hour

If you prefer raw MCP, delete this folder and wire your servers however you like. The rest of X-DEEP OS doesn't care.
