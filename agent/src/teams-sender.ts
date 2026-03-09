// Proactive Teams messaging via Microsoft Graph chatMessage API

import { getGraphClient } from "./graph-auth.js";

/**
 * Send a plain-text message to the user's personal Teams chat.
 * Requires Chat.ReadWrite permission.
 */
export async function sendTeamsMessage(content: string): Promise<SendResult> {
  const client = getGraphClient();
  if (!client) {
    return { success: false, message: "Not authenticated. Call authenticate() first." };
  }

  try {
    // Find or create a 1:1 chat with the bot (self-chat for personal messages)
    const chatId = await getPersonalChatId(client);
    if (!chatId) {
      return { success: false, message: "Could not find personal Teams chat. Ensure the app is installed in Teams." };
    }

    await client.api(`/chats/${chatId}/messages`).post({
      body: {
        contentType: "html",
        content: markdownToHtml(content),
      },
    });

    return { success: true, message: "Summary sent to Teams." };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to send Teams message: ${msg}` };
  }
}

/**
 * Send an Adaptive Card to the user's personal Teams chat.
 */
export async function sendTeamsCard(card: Record<string, unknown>): Promise<SendResult> {
  const client = getGraphClient();
  if (!client) {
    return { success: false, message: "Not authenticated. Call authenticate() first." };
  }

  try {
    const chatId = await getPersonalChatId(client);
    if (!chatId) {
      return { success: false, message: "Could not find personal Teams chat." };
    }

    await client.api(`/chats/${chatId}/messages`).post({
      body: {
        contentType: "html",
        content: `<attachment id="adaptiveCard"></attachment>`,
      },
      attachments: [
        {
          id: "adaptiveCard",
          contentType: "application/vnd.microsoft.card.adaptive",
          content: JSON.stringify(card),
        },
      ],
    });

    return { success: true, message: "Adaptive Card sent to Teams." };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to send Teams card: ${msg}` };
  }
}

export interface SendResult {
  success: boolean;
  message: string;
}

// ── Internal helpers ──

let cachedChatId: string | null = null;

async function getPersonalChatId(client: ReturnType<typeof getGraphClient>): Promise<string | null> {
  if (cachedChatId) return cachedChatId;
  if (!client) return null;

  try {
    // List chats and find "meeting with self" or a 1:1 with the bot
    // For proactive messaging, we look for existing chats
    const chats = await client.api("/me/chats")
      .filter("chatType eq 'oneOnOne'")
      .select("id,chatType,topic")
      .top(50)
      .get();

    if (chats.value && chats.value.length > 0) {
      // Use the first oneOnOne chat as the delivery target
      // In production, this should target the specific bot<->user chat
      cachedChatId = chats.value[0].id;
      return cachedChatId;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Basic Markdown-to-HTML conversion for Teams messages.
 */
function markdownToHtml(md: string): string {
  return md
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/_(.*?)_/g, "<i>$1</i>")
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    .replace(/^• /gm, "&#8226; ")
    .replace(/^⚡ /gm, "⚡ ")
    .replace(/\n/g, "<br/>");
}
