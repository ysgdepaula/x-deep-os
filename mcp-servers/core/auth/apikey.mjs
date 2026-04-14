/**
 * Reusable API Key helper for REST API services.
 * Priority: env vars (MCP_AUTH_*) → file in configDir.
 * Env vars are set per child process via mcp-config.mjs.
 *
 * Supports multiple auth formats:
 *   - Slug+secret: { organization_slug, secret_key } → "org_slug:secret_key" (e.g. Qonto)
 *   - Bearer: { bearer_token } → "Bearer <token>" (e.g. Pennylane, Stripe)
 *   - Generic API key: { api_key } → "X-API-Key: <api_key>" (e.g. OpenAI, Notion)
 */
import fs from "fs";
import path from "path";

export function loadApiKey(configDir) {
  let data;

  // Try env vars first (Railway / Docker)
  if (process.env.MCP_AUTH_ORG_SLUG && process.env.MCP_AUTH_SECRET_KEY) {
    data = { organization_slug: process.env.MCP_AUTH_ORG_SLUG, secret_key: process.env.MCP_AUTH_SECRET_KEY };
  } else if (process.env.MCP_AUTH_BEARER_TOKEN) {
    data = { bearer_token: process.env.MCP_AUTH_BEARER_TOKEN };
  } else if (process.env.MCP_AUTH_API_KEY) {
    data = { api_key: process.env.MCP_AUTH_API_KEY };
  } else {
    // Fall back to file (local dev)
    const keyPath = path.join(configDir, "api-key.json");
    data = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  }

  // slug+secret format (e.g. Qonto)
  if (data.organization_slug && data.secret_key) {
    return {
      type: "slug-secret",
      slug: data.organization_slug,
      key: data.secret_key,
      getHeaders() {
        return { Authorization: `${this.slug}:${this.key}` };
      }
    };
  }

  // Bearer token format (e.g. Pennylane, Stripe, most REST APIs)
  if (data.bearer_token) {
    return {
      type: "bearer",
      token: data.bearer_token,
      getHeaders() {
        return { Authorization: `Bearer ${this.token}` };
      }
    };
  }

  // Generic API key
  if (data.api_key) {
    return {
      type: "generic",
      key: data.api_key,
      getHeaders() {
        return { "X-API-Key": this.key };
      }
    };
  }

  throw new Error(`Unrecognized api-key format. Expected: organization_slug+secret_key, bearer_token, or api_key`);
}
