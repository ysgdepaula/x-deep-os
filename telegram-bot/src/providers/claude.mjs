import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Claude provider — swappable LLM adapter.
 *
 * Interface contract (any provider must implement):
 *   callLLM({ messages, tools, systemPrompt, model?, maxTokens? })
 *     → { content: ContentBlock[], stopReason: string }
 *
 *   formatToolResult(toolUseId, result, isError)
 *     → tool_result content block
 */

/**
 * Call Claude API with messages and tools.
 * Returns the raw response content blocks and stop reason.
 */
export async function callLLM({ messages, tools, systemPrompt, model = "claude-sonnet-4-6", maxTokens = 8096 }) {
  // Retry with backoff on rate limit (429)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Enable prompt caching: system prompt + tools are cached across calls.
      // Cached tokens are 90% cheaper and 2x faster.
      const systemWithCache = [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ];

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemWithCache,
        tools,
        messages,
      });

      if (response.usage) {
        console.log(`[TOKENS] in=${response.usage.input_tokens} out=${response.usage.output_tokens} cache_read=${response.usage.cache_read_input_tokens || 0}`);
      }

      return {
        content: response.content,
        stopReason: response.stop_reason,
        usage: response.usage,
      };
    } catch (err) {
      if (err.status === 429 && attempt < 2) {
        const wait = (attempt + 1) * 10;
        console.log(`[RATE LIMIT] Attempt ${attempt + 1}/3 — waiting ${wait}s...`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Format a tool result for the next Claude request.
 */
export function formatToolResult(toolUseId, result, isError = false) {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: typeof result === "string" ? result : JSON.stringify(result),
    ...(isError && { is_error: true }),
  };
}

/**
 * Provider metadata — useful for logging and cost tracking.
 */
export const PROVIDER_INFO = {
  name: "claude",
  model: "claude-sonnet-4-6",
  inputCostPer1M: 3.0,
  outputCostPer1M: 15.0,
};
