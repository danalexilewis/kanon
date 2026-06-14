import type { UIToolInvocation } from "ai";
import type { SetTitleTool } from "@/lib/openrouter-chat";
import type { ChatUIMessage } from "@/lib/chat-types";

export type StoredChat = {
  id: string;
  title: string | null;
  messages: ChatUIMessage[];
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "ai-chat-history-v1";
const MAX_CHATS = 50;

export function newChatId() {
  return crypto.randomUUID();
}

export function loadChats(): StoredChat[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as StoredChat[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (chat) =>
        typeof chat.id === "string" &&
        Array.isArray(chat.messages) &&
        typeof chat.createdAt === "number" &&
        typeof chat.updatedAt === "number",
    );
  } catch {
    return [];
  }
}

function saveChats(chats: StoredChat[]) {
  if (typeof window === "undefined") return;

  try {
    const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
    const capped = sorted.slice(0, MAX_CHATS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
    return capped;
  } catch {
    return chats;
  }
}

export function upsertChat(chat: StoredChat): StoredChat[] {
  const chats = loadChats();
  const index = chats.findIndex((item) => item.id === chat.id);
  const next =
    index === -1
      ? [...chats, chat]
      : chats.map((item) => (item.id === chat.id ? chat : item));
  return saveChats(next) ?? next;
}

export function deleteChat(id: string): StoredChat[] {
  const next = loadChats().filter((chat) => chat.id !== id);
  saveChats(next);
  return next;
}

export function getChatTitle(chat: StoredChat): string {
  if (chat.title?.trim()) return chat.title.trim();
  return fallbackTitleFromMessages(chat.messages);
}

export function fallbackTitleFromMessages(messages: ChatUIMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) return "New chat";

  let text = "";
  for (const part of firstUser.parts ?? []) {
    if (part.type === "text") text += part.text;
  }

  const trimmed = text.trim();
  if (!trimmed) return "New chat";
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

export function extractTitleFromMessages(
  messages: ChatUIMessage[],
): string | null {
  for (const message of messages) {
    if (message.role !== "assistant") continue;

    for (const part of message.parts ?? []) {
      if (part.type !== "tool-setTitle") continue;

      const invocation = part as UIToolInvocation<SetTitleTool>;

      if (
        invocation.state === "output-available" &&
        typeof invocation.output === "string"
      ) {
        const title = invocation.output.trim();
        if (title) return title;
      }

      const input = invocation.input as { title?: string } | undefined;
      if (input?.title?.trim()) return input.title.trim();
    }
  }

  return null;
}

export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}
