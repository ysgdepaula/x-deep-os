/**
 * Convert GitHub-flavored markdown to Telegram HTML.
 * Telegram supports: <b>, <i>, <code>, <pre>, <a href="">, <s>, <u>
 * Does NOT support: ##, ---, tables, [text](url) with complex nesting
 */
export function markdownToTelegramHTML(text) {
  let html = text;

  // Headers: ## Title → <b>Title</b>
  html = html.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // Horizontal rules: --- → empty line
  html = html.replace(/^-{3,}$/gm, "");

  // Bold: **text** → <b>text</b> (do before single *)
  html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  // Italic: *text* or _text_ → <i>text</i>
  html = html.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, "<i>$1</i>");
  html = html.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "<i>$1</i>");

  // Inline code: `text` → <code>text</code>
  html = html.replace(/`([^`\n]+?)`/g, "<code>$1</code>");

  // Code blocks: ```text``` → <pre>text</pre>
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, "<pre>$1</pre>");

  // Links: [text](url) → <a href="url">text</a>
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Tables: convert | col1 | col2 | to plain text lines
  // Remove separator rows (|---|---|)
  html = html.replace(/^\|[-\s|:]+\|$/gm, "");
  // Convert table rows to clean text
  html = html.replace(/^\|(.+)\|$/gm, (_, row) => {
    return row.split("|").map((cell) => cell.trim()).filter(Boolean).join(" — ");
  });

  // Blockquotes: > text → text (just remove the >)
  html = html.replace(/^>\s?(.*)$/gm, "$1");

  // Clean up multiple empty lines
  html = html.replace(/\n{3,}/g, "\n\n");

  return html.trim();
}

/**
 * Split a long message into chunks for Telegram (max 4096 chars).
 */
export function splitMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }
  return chunks;
}
