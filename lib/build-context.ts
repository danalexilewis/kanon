import type { UIToolInvocation } from "ai";
import type { ChatDocument, SearchTool } from "@/lib/openrouter-chat";
import type { ChatUIMessage } from "@/lib/chat-types";

export type ThreadSource = {
  url: string;
  title: string;
  content: string;
};

export type ThreadContext = {
  transcript: string;
  sources: ThreadSource[];
};

function getMessageText(message: ChatUIMessage): string {
  let text = "";
  for (const part of message.parts ?? []) {
    if (part.type === "text") text += part.text;
  }
  return text.trim();
}

function extractSourcesFromMessages(messages: ChatUIMessage[]): ThreadSource[] {
  const seen = new Set<string>();
  const sources: ThreadSource[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") continue;

    for (const part of message.parts ?? []) {
      if (part.type !== "tool-search") continue;

      const invocation = part as UIToolInvocation<SearchTool>;
      if (!invocation.output || !Array.isArray(invocation.output)) continue;

      for (const item of invocation.output) {
        const doc = (item as { doc?: ChatDocument })?.doc;
        if (!doc?.url || seen.has(doc.url)) continue;
        seen.add(doc.url);
        sources.push({
          url: doc.url,
          title: doc.title || doc.url,
          content: doc.content?.trim() ?? "",
        });
      }
    }
  }

  return sources;
}

function formatTranscript(messages: ChatUIMessage[]): string {
  const sections: string[] = [];

  for (const message of messages) {
    if (message.role === "system") continue;

    const text = getMessageText(message);
    if (!text) continue;

    const heading = message.role === "user" ? "## You" : "## Assistant";
    sections.push(`${heading}\n\n${text}`);
  }

  return sections.join("\n\n");
}

/** Extract transcript and cited doc snippets from a chat thread. */
export function extractThreadContext(messages: ChatUIMessage[]): ThreadContext {
  return {
    transcript: formatTranscript(messages),
    sources: extractSourcesFromMessages(messages),
  };
}

export type AssembleContextPackInput = {
  title: string;
  summary: string;
  transcript: string;
  sources: ThreadSource[];
  generatedAt?: Date;
};

/** Assemble a portable Markdown context pack for another LLM thread. */
export function assembleContextPack({
  title,
  summary,
  transcript,
  sources,
  generatedAt = new Date(),
}: AssembleContextPackInput): string {
  const dateLabel = generatedAt.toISOString().slice(0, 10);
  const sections: string[] = [
    `# Context pack: ${title}`,
    "",
    `Generated: ${dateLabel}`,
    "",
    "Portable context from Kanon knowledge base (Chat to Docs). Paste into another LLM to continue work.",
    "",
  ];

  const trimmedSummary = summary.trim();
  if (trimmedSummary) {
    sections.push("## Summary", "", trimmedSummary, "");
  }

  if (transcript.trim()) {
    sections.push("## Conversation", "", transcript.trim(), "");
  }

  if (sources.length > 0) {
    sections.push("## Sources");
    for (const source of sources) {
      sections.push("", `### ${source.title}`, "", `URL: ${source.url}`, "");
      if (source.content) {
        sections.push(source.content);
      }
    }
  }

  return sections.join("\n").trimEnd() + "\n";
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "chat";
}

/** Filename for a downloaded context pack. */
export function contextPackFilename(
  title: string,
  generatedAt = new Date(),
): string {
  const dateLabel = generatedAt.toISOString().slice(0, 10);
  return `kanon-context-${slugifyTitle(title)}-${dateLabel}.md`;
}

export const buildContextSummarySystemPrompt = [
  "You condense knowledge-base Q&A into a portable brief for another LLM thread.",
  "Output Markdown only (no preamble). Include:",
  "- **Topic**: one line",
  "- **Key question**: what the user was trying to learn or decide",
  "- **Answer / conclusions**: the main grounded answer from the assistant",
  "- **Open items**: unresolved questions or follow-ups, if any",
  "Be concise and factual. Do not invent facts not present in the transcript.",
].join("\n");
