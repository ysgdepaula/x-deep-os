import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCP_SERVERS } from "./mcp-config.mjs";

/**
 * MCPManager — connects to MCP servers, discovers tools, routes calls.
 * Same servers as Claude Code terminal, auto-discovered.
 */
class MCPManager {
  constructor() {
    // serverName → { client, transport, tools[] }
    this.servers = new Map();
    // prefixed tool name → { serverName, originalName }
    this.toolRoutes = new Map();
    // cached Anthropic-format tools
    this._anthropicTools = null;
  }

  /**
   * Connect to all MCP servers in parallel.
   * Graceful degradation: if a server fails, log and continue.
   */
  async connect() {
    const entries = Object.entries(MCP_SERVERS);
    console.log(`[MCP] Connecting to ${entries.length} servers...`);

    const results = await Promise.allSettled(
      entries.map(([name, config]) => this._connectServer(name, config))
    );

    let connected = 0;
    let totalTools = 0;
    for (let i = 0; i < results.length; i++) {
      const [name] = entries[i];
      if (results[i].status === "fulfilled") {
        const toolCount = this.servers.get(name).tools.length;
        totalTools += toolCount;
        connected++;
        console.log(`  ✅ ${name} — ${toolCount} tools`);
      } else {
        console.warn(`  ⚠️  ${name} — failed: ${results[i].reason?.message || results[i].reason}`);
      }
    }

    console.log(`[MCP] ${connected}/${entries.length} servers connected, ${totalTools} tools discovered`);
    this._anthropicTools = null; // invalidate cache
  }

  async _connectServer(name, config) {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env },
    });

    const client = new Client({
      name: process.env.MCP_CLIENT_NAME || "xdeep-telegram",
      version: "1.0.0",
    });

    await client.connect(transport);

    // Discover tools
    const { tools } = await client.listTools();

    // Store server info
    this.servers.set(name, { client, transport, tools });

    // Register tool routes with prefix mcp__<server>__<tool>
    for (const tool of tools) {
      const prefixed = `mcp__${name}__${tool.name}`;
      this.toolRoutes.set(prefixed, { serverName: name, originalName: tool.name });
    }
  }

  /**
   * Get all tools in Anthropic API format.
   * Converts MCP inputSchema (camelCase) → input_schema (snake_case).
   * Prefixes tool names to avoid collisions between servers.
   */
  getAnthropicTools() {
    if (this._anthropicTools) return this._anthropicTools;

    const tools = [];
    for (const [serverName, { tools: serverTools }] of this.servers) {
      for (const tool of serverTools) {
        // Truncate long descriptions to save tokens
        const desc = (tool.description || "").substring(0, 150);
        // Ensure schema always has type + properties (some MCP servers omit them)
        const rawSchema = tool.inputSchema;
        const safeSchema = rawSchema && typeof rawSchema === "object"
          ? { type: "object", properties: {}, ...rawSchema }
          : { type: "object", properties: {} };
        tools.push({
          name: `mcp__${serverName}__${tool.name}`,
          description: `[${serverName}] ${desc}`,
          input_schema: safeSchema,
        });
      }
    }

    this._anthropicTools = tools;
    return tools;
  }

  /**
   * Get tools filtered by intent to minimize token usage.
   *
   * Each tool schema costs ~150-300 tokens. With many MCP servers that
   * adds up fast on the Free Tier (10K input tokens/min), so we gate
   * tool availability by intent.
   *
   * By default this returns ALL tools. Override by setting
   * INTENT_SERVERS below or by customising this method to your own
   * intent taxonomy — see system-prompt.mjs for how intents are detected.
   */
  getToolsForIntent(intent) {
    // Map intent name → allowed MCP server names. Empty array or missing
    // key = all servers allowed. Customize to your own skills/intents.
    const INTENT_SERVERS = {
      // Example:
      // hello:   ["google-calendar", "gmail", "notion"],
      // finance: ["gmail"],
      // general: [], // all servers
    };

    const allowedServers = INTENT_SERVERS[intent];
    const allTools = this.getAnthropicTools();

    // If no filter configured for this intent, return everything.
    if (!allowedServers || allowedServers.length === 0) return allTools;

    return allTools.filter((tool) => {
      if (!tool.name.startsWith("mcp__")) return true;
      const match = tool.name.match(/^mcp__([^_]+)__/);
      if (!match) return true;
      return allowedServers.includes(match[1]);
    });
  }

  /**
   * Call a tool by its prefixed name.
   * Routes to the correct MCP server.
   */
  async callTool(prefixedName, args) {
    const route = this.toolRoutes.get(prefixedName);
    if (!route) throw new Error(`Unknown MCP tool: ${prefixedName}`);

    const server = this.servers.get(route.serverName);
    if (!server) throw new Error(`Server ${route.serverName} not connected`);

    const result = await server.client.callTool({
      name: route.originalName,
      arguments: args,
    });

    // MCP returns { content: [{ type, text }], isError }
    if (result.isError) {
      const text = result.content?.map((c) => c.text || "").join("\n") || "MCP tool error";
      throw new Error(text);
    }

    return result.content?.map((c) => c.text || "").join("\n") || "";
  }

  /**
   * Check if a prefixed tool name belongs to MCP.
   */
  isMcpTool(name) {
    return this.toolRoutes.has(name);
  }

  /**
   * Disconnect all servers cleanly.
   */
  async disconnect() {
    for (const [name, { client, transport }] of this.servers) {
      try {
        await client.close();
        await transport.close();
      } catch (err) {
        console.warn(`[MCP] Error closing ${name}: ${err.message}`);
      }
    }
    this.servers.clear();
    this.toolRoutes.clear();
    this._anthropicTools = null;
    console.log("[MCP] All servers disconnected");
  }
}

// Singleton
export const mcpManager = new MCPManager();

// CLI test mode: node src/mcp-manager.mjs --test
if (process.argv.includes("--test")) {
  console.log("Testing MCP connections...");
  mcpManager.connect().then(() => {
    console.log("\nAnthropic tool format sample:");
    const tools = mcpManager.getAnthropicTools();
    tools.slice(0, 3).forEach((t) => console.log(`  ${t.name}: ${t.description}`));
    console.log(`  ... (${tools.length} total)`);
    return mcpManager.disconnect();
  }).catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
}
