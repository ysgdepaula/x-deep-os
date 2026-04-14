// Example MCP service — starter template
// Copy this folder under a new name (kebab-case) and edit to connect your own API.
// After editing, register the service by running:
//   node mcp-servers/scripts/add-service.mjs <your-service-name>

import { z } from "zod";

export const tools = [
  {
    name: "example_tool",
    description: "Example tool that echoes back the provided message. Replace with your own logic.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to echo back" }
      },
      required: ["message"]
    },
    handler: async ({ message }) => {
      return {
        content: [
          {
            type: "text",
            text: `Echo: ${message}`
          }
        ]
      };
    }
  }
];

// Optional: initialization hook. Runs once when the server starts.
// Use this to read credentials, open DB connections, authenticate, etc.
export async function init(config) {
  // const credentialsPath = `${process.env.MCP_CONFIG_DIR}/credentials/${config.name}/token.json`;
  // const creds = JSON.parse(await fs.readFile(credentialsPath, "utf8"));
  // return { client: yourSdk(creds) };
  return {};
}

// Optional: validation hook. Runs before each tool call.
// Use to refresh tokens, check quotas, etc.
export async function preHook(toolName, input, state) {
  // e.g. if (state.client.tokenExpired()) await state.client.refresh();
}
