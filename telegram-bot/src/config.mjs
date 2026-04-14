import "dotenv/config";

// Simplified config — OAuth2/API credentials are now handled by MCP servers.
// Only bot-level config remains here.

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  allowedChatIds: process.env.ALLOWED_CHAT_IDS?.split(",").map(Number).filter(Boolean) || [],
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
};
