/**
 * Gmail MCP Tools
 * 6 tools: get_profile, search_messages, read_message, create_draft, send_draft, send_email
 */
import { google } from "googleapis";
import { z } from "zod";

function getHeader(headers, name) {
  const h = headers?.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

/** Encode a header value as RFC 2047 UTF-8 Base64 if it contains non-ASCII chars */
function encodeHeader(value) {
  if (/^[\x20-\x7E]*$/.test(value)) return value; // pure ASCII, no encoding needed
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function decodeBody(payload) {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf8");
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf8")
          .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    for (const part of payload.parts) {
      if (part.parts) {
        const result = decodeBody(part);
        if (result) return result;
      }
    }
  }
  return "(no readable content)";
}

export function registerTools(server, { auth, configDir, accountName }) {
  const gmail = google.gmail({ version: "v1", auth });

  server.tool("get_profile", `Get the email address and stats for ${accountName}`, {}, async () => {
    const res = await gmail.users.getProfile({ userId: "me" });
    return { content: [{ type: "text", text: JSON.stringify(res.data) }] };
  });

  server.tool("search_messages",
    `Search emails in ${accountName}. Use Gmail search syntax (from:, to:, subject:, is:unread, etc.)`,
    {
      q: z.string().optional().describe("Gmail search query"),
      maxResults: z.number().optional().default(10).describe("Max results (default 10)")
    },
    async ({ q, maxResults }) => {
      const res = await gmail.users.messages.list({ userId: "me", q: q || "", maxResults: maxResults || 10 });
      const messages = res.data.messages || [];

      const summaries = await Promise.all(messages.slice(0, maxResults || 10).map(async (msg) => {
        try {
          const detail = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "metadata", metadataHeaders: ["From", "To", "Subject", "Date"] });
          return {
            id: msg.id,
            threadId: msg.threadId,
            from: getHeader(detail.data.payload?.headers, "From"),
            to: getHeader(detail.data.payload?.headers, "To"),
            subject: getHeader(detail.data.payload?.headers, "Subject"),
            date: getHeader(detail.data.payload?.headers, "Date"),
            snippet: detail.data.snippet
          };
        } catch {
          return { id: msg.id, threadId: msg.threadId, error: "Could not fetch details" };
        }
      }));

      return { content: [{ type: "text", text: JSON.stringify({ resultCount: messages.length, messages: summaries }, null, 2) }] };
    }
  );

  server.tool("read_message",
    `Read the full content of an email in ${accountName}`,
    { messageId: z.string().describe("Message ID from search_messages") },
    async ({ messageId }) => {
      const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
      const headers = res.data.payload?.headers || [];
      const body = decodeBody(res.data.payload);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            id: res.data.id,
            threadId: res.data.threadId,
            from: getHeader(headers, "From"),
            to: getHeader(headers, "To"),
            cc: getHeader(headers, "Cc"),
            subject: getHeader(headers, "Subject"),
            date: getHeader(headers, "Date"),
            labels: res.data.labelIds,
            body: body.substring(0, 5000)
          }, null, 2)
        }]
      };
    }
  );

  server.tool("create_draft",
    `Create an email draft in ${accountName}`,
    {
      to: z.string().describe("Recipient email(s), comma-separated"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (plain text)"),
      cc: z.string().optional().describe("CC recipients"),
      threadId: z.string().optional().describe("Thread ID for replies")
    },
    async ({ to, subject, body, cc, threadId }) => {
      const lines = [
        `To: ${to}`,
        cc ? `Cc: ${cc}` : null,
        `Subject: ${encodeHeader(subject)}`,
        `Content-Type: text/plain; charset=utf-8`,
        `Content-Transfer-Encoding: base64`,
        "",
        Buffer.from(body, "utf8").toString("base64")
      ].filter(x => x !== null).join("\r\n");

      const raw = Buffer.from(lines).toString("base64url");
      const draft = { message: { raw } };
      if (threadId) draft.message.threadId = threadId;

      const res = await gmail.users.drafts.create({ userId: "me", requestBody: draft });
      return { content: [{ type: "text", text: JSON.stringify({ draftId: res.data.id, message: "Draft created successfully" }) }] };
    }
  );

  server.tool("send_draft",
    `Send a previously created draft from ${accountName}`,
    { draftId: z.string().describe("Draft ID from create_draft") },
    async ({ draftId }) => {
      const res = await gmail.users.drafts.send({ userId: "me", requestBody: { id: draftId } });
      return { content: [{ type: "text", text: JSON.stringify({ messageId: res.data.id, threadId: res.data.threadId, status: "Sent successfully" }) }] };
    }
  );

  server.tool("send_email",
    `Send an email directly from ${accountName} (without creating a draft first)`,
    {
      to: z.string().describe("Recipient email(s), comma-separated"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (plain text)"),
      cc: z.string().optional().describe("CC recipients"),
      threadId: z.string().optional().describe("Thread ID for replies")
    },
    async ({ to, subject, body, cc, threadId }) => {
      const lines = [
        `To: ${to}`,
        cc ? `Cc: ${cc}` : null,
        `Subject: ${encodeHeader(subject)}`,
        `Content-Type: text/plain; charset=utf-8`,
        `Content-Transfer-Encoding: base64`,
        "",
        Buffer.from(body, "utf8").toString("base64")
      ].filter(x => x !== null).join("\r\n");

      const raw = Buffer.from(lines).toString("base64url");
      const msg = { raw };
      if (threadId) msg.threadId = threadId;

      const res = await gmail.users.messages.send({ userId: "me", requestBody: msg });
      return { content: [{ type: "text", text: JSON.stringify({ messageId: res.data.id, threadId: res.data.threadId, status: "Sent successfully" }) }] };
    }
  );
}
