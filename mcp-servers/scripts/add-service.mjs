#!/usr/bin/env node
/**
 * Scaffold a new MCP service module.
 *
 * Usage: node scripts/add-service.mjs <service-name>
 * Example: node scripts/add-service.mjs google-drive
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const serviceName = process.argv[2];

if (!serviceName) {
  console.error("Usage: node scripts/add-service.mjs <service-name>");
  console.error("Example: node scripts/add-service.mjs google-drive");
  process.exit(1);
}

if (!/^[a-z][a-z0-9-]*$/.test(serviceName)) {
  console.error(`Invalid service name "${serviceName}". Use lowercase letters, numbers, and hyphens.`);
  process.exit(1);
}

const serviceDir = path.join(rootDir, "services", serviceName);

if (fs.existsSync(serviceDir)) {
  console.error(`Service "${serviceName}" already exists at ${serviceDir}`);
  process.exit(1);
}

// Create directory
fs.mkdirSync(serviceDir, { recursive: true });

// Write tools.mjs template
const toolsTemplate = `/**
 * ${serviceName} MCP Tools
 * Add your tools below using server.tool()
 */
import { z } from "zod";

export function registerTools(server, { auth, configDir, accountName }) {
  // auth = OAuth2Client (if authType is "oauth2" in config.json)
  // configDir = path to credentials directory (from MCP_CONFIG_DIR env)
  // accountName = display name (from ACCOUNT_NAME env)

  // Example tool:
  // server.tool("list_items",
  //   \`List items in \${accountName}\`,
  //   { query: z.string().optional().describe("Search query") },
  //   async ({ query }) => {
  //     // Your implementation here
  //     return { content: [{ type: "text", text: JSON.stringify({ items: [] }) }] };
  //   }
  // );
}
`;

const configTemplate = {
  name: serviceName,
  description: `TODO: describe the ${serviceName} service`,
  requiredEnv: ["MCP_CONFIG_DIR"],
  optionalEnv: ["ACCOUNT_NAME"],
  authType: "oauth2",
  tools: []
};

fs.writeFileSync(path.join(serviceDir, "tools.mjs"), toolsTemplate);
fs.writeFileSync(path.join(serviceDir, "config.json"), JSON.stringify(configTemplate, null, 2) + "\n");

console.log(`\n  Service "${serviceName}" created at ${serviceDir}/\n`);
console.log(`  Files:`);
console.log(`    - tools.mjs   (add your tools here)`);
console.log(`    - config.json (update description and tools list)\n`);
console.log(`  Next steps:`);
console.log(`  1. Edit services/${serviceName}/tools.mjs — add your tools`);
console.log(`  2. Create credentials dir: mkdir -p ~/.mcp-servers/credentials/${serviceName}`);
console.log(`  3. Add OAuth credentials (gcp-oauth.keys.json + credentials.json) to that dir`);
console.log(`  4. Add to ~/.claude.json under your project's mcpServers:\n`);
console.log(`     "${serviceName}": {`);
console.log(`       "type": "stdio",`);
console.log(`       "command": "node",`);
console.log(`       "args": ["${path.join(rootDir, "core", "server.mjs")}", "--service", "${serviceName}"],`);
console.log(`       "env": {`);
console.log(`         "MCP_CONFIG_DIR": "${path.join(rootDir, "credentials", serviceName)}",`);
console.log(`         "ACCOUNT_NAME": "${serviceName}",`);
console.log(`         "NODE_EXTRA_CA_CERTS": "~/.claude/ca-certs.pem"`);
console.log(`       }`);
console.log(`     }\n`);
console.log(`  5. Restart Claude Code to load the new server\n`);
