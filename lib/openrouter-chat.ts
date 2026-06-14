import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { tool } from "ai";
import { Document, type DocumentData } from "flexsearch";
import { z } from "zod";
import { source } from "@/lib/source";

export const FREE_MODEL = "google/gemma-4-31b-it:free";
export const PAID_FALLBACK = "deepseek/deepseek-v4-flash";

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export function getOpenRouterChatModel() {
  const primaryModel = process.env.OPENROUTER_MODEL ?? FREE_MODEL;
  const fallbackModels = [primaryModel, PAID_FALLBACK].filter(
    (model, index, models) => models.indexOf(model) === index,
  );
  return openrouter.chat(primaryModel, { models: fallbackModels });
}

export interface ChatDocument extends DocumentData {
  url: string;
  title: string;
  description: string;
  content: string;
}

async function chunkedAll<O>(promises: Promise<O>[]): Promise<O[]> {
  const size = 50;
  const out: O[] = [];
  for (let index = 0; index < promises.length; index += size) {
    out.push(...(await Promise.all(promises.slice(index, index + size))));
  }
  return out;
}

let searchServerPromise: Promise<Document<ChatDocument>> | null = null;

function getSearchServerPromise() {
  if (!searchServerPromise) {
    searchServerPromise = createSearchServer();
  }
  return searchServerPromise;
}

async function createSearchServer() {
  const search = new Document<ChatDocument>({
    document: {
      id: "url",
      index: ["title", "description", "content"],
      store: true,
    },
  });

  const docs = await chunkedAll(
    source.getPages().map(async (page) => {
      if (!("getText" in page.data)) return null;

      return {
        title: page.data.title,
        description: page.data.description ?? "",
        url: page.url,
        content: await page.data.getText("processed"),
      } as ChatDocument;
    }),
  );

  for (const doc of docs) {
    if (doc) search.add(doc);
  }

  return search;
}

export const searchTool = tool({
  description: "Search the docs content and return raw JSON results.",
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().int().min(1).max(100).default(10),
  }),
  async execute({ query, limit }) {
    const search = await getSearchServerPromise();
    return await search.searchAsync(query, {
      limit,
      merge: true,
      enrich: true,
    });
  },
});

export type SearchTool = typeof searchTool;

export const suggestFollowupsTool = tool({
  description:
    "After answering, suggest up to 3 concise follow-up questions the user might ask next. Ground them in the docs context you used.",
  inputSchema: z.object({
    questions: z.array(z.string()).max(3),
  }),
  execute({ questions }) {
    return questions;
  },
});

export type SuggestFollowupsTool = typeof suggestFollowupsTool;

export const setTitleTool = tool({
  description:
    "Set a concise title for this conversation. Call once on your first reply in a new conversation.",
  inputSchema: z.object({
    title: z.string().max(80),
  }),
  execute({ title }) {
    return title;
  },
});

export type SetTitleTool = typeof setTitleTool;

export const systemPrompt = [
  "You are the knowledge assistant for this Kanon knowledge base.",
  "Use the `search` tool to retrieve relevant docs context before answering when needed.",
  "The `search` tool returns raw JSON results from documentation. Use those results to ground your answer and cite sources as markdown links using the document `url` field when available.",
  "If you cannot find the answer in search results, say you do not know and suggest a better search query.",
  "On your first reply in a new conversation, call `setTitle` once with a concise 3-6 word title for the topic.",
  "After each answer, call `suggestFollowups` with up to 3 concise, docs-grounded follow-up questions the user might ask next.",
].join("\n");
