#!/usr/bin/env node
/**
 * Generic MCP Server Factory
 * Dynamically loads a service module and starts an MCP server over stdio.
 *
 * Usage: node server.mjs --service gmail
 * Env vars:
 *   MCP_CONFIG_DIR  — path to credentials directory (required)
 *   ACCOUNT_NAME    — display name for the account (optional, defaults to service name)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOAuth2Client } from "./auth/oauth2.mjs";
import { loadApiKey } from "./auth/apikey.mjs";
import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";

// Parse --service argument
const args = process.argv.slice(2);
const serviceIdx = args.indexOf("--service");
if (serviceIdx === -1 || !args[serviceIdx + 1]) {
  console.error("Usage: node server.mjs --service <service-name>");
  console.error("Example: node server.mjs --service gmail");
  process.exit(1);
}
const serviceName = args[serviceIdx + 1];

// Resolve paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const servicesDir = path.join(__dirname, "..", "services");
const serviceDir = path.join(servicesDir, serviceName);

// Check service exists
if (!fs.existsSync(path.join(serviceDir, "tools.mjs"))) {
  console.error(`Service "${serviceName}" not found at ${serviceDir}/tools.mjs`);
  console.error(`Available services: ${fs.readdirSync(servicesDir).filter(d => fs.existsSync(path.join(servicesDir, d, "tools.mjs"))).join(", ") || "(none)"}`);
  process.exit(1);
}

// Config from env vars
const configDir = process.env.MCP_CONFIG_DIR || path.join(os.homedir(), `.mcp-servers/credentials/${serviceName}`);
const accountName = process.env.ACCOUNT_NAME || serviceName;

// Load service config (optional)
let serviceConfig = {};
const configPath = path.join(serviceDir, "config.json");
if (fs.existsSync(configPath)) {
  serviceConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
}

// Create auth client
let auth = null;
try {
  if (serviceConfig.authType === "none") {
    auth = null;
  } else if (serviceConfig.authType === "apikey") {
    auth = loadApiKey(configDir);
  } else if (serviceConfig.authType === "token") {
    // Token-based services (e.g. Notion) handle auth internally in tools.mjs
    auth = null;
  } else {
    auth = createOAuth2Client(configDir);
  }
} catch (err) {
  if (serviceConfig.authType === "oauth2" || serviceConfig.authType === "apikey") {
    console.error(`Auth failed for ${serviceName} (${serviceConfig.authType}): ${err.message}`);
    console.error(`Check credentials in ${configDir}`);
    process.exit(1);
  }
  // For unrecognized authTypes, warn but continue
  console.warn(`Auth init warning for ${serviceName}: ${err.message}`);
}

// Create MCP server
const server = new McpServer({
  name: `${serviceName}-${accountName}`,
  version: "1.0.0",
  description: serviceConfig.description || `${serviceName} account: ${accountName}`
});

// Load and register tools
const toolsModule = await import(path.join(serviceDir, "tools.mjs"));
toolsModule.registerTools(server, { auth, configDir, accountName });

// Connect stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
