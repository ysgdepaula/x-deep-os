/**
 * Reusable OAuth2 helper for Google API services.
 * Priority: env vars (MCP_AUTH_*) → files in configDir.
 * Env vars are set per child process via mcp-config.mjs.
 */
import { OAuth2Client } from "google-auth-library";
import fs from "fs";
import path from "path";

export function createOAuth2Client(configDir) {
  let client_id, client_secret, refresh_token;

  // Try env vars first (Railway / Docker)
  if (process.env.MCP_AUTH_CLIENT_ID && process.env.MCP_AUTH_CLIENT_SECRET && process.env.MCP_AUTH_REFRESH_TOKEN) {
    client_id = process.env.MCP_AUTH_CLIENT_ID;
    client_secret = process.env.MCP_AUTH_CLIENT_SECRET;
    refresh_token = process.env.MCP_AUTH_REFRESH_TOKEN;
  } else {
    // Fall back to files (local dev)
    const oauthPath = path.join(configDir, "gcp-oauth.keys.json");
    const credsPath = path.join(configDir, "credentials.json");
    const keys = JSON.parse(fs.readFileSync(oauthPath, "utf8"));
    ({ client_id, client_secret } = keys.installed || keys.web);
    const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
    refresh_token = creds.refresh_token;
  }

  const client = new OAuth2Client({ clientId: client_id, clientSecret: client_secret });
  client.setCredentials({ refresh_token });
  return client;
}
