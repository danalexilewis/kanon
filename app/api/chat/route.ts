import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { getFlowSystemPrompt, isChatFlowId } from "@/lib/chat-flows";
import type { ChatUIMessage } from "@/lib/chat-types";
import {
  getOpenRouterChatModel,
  searchTool,
  setTitleTool,
  suggestFollowupsTool,
  systemPrompt,
} from "@/lib/openrouter-chat";

export async function POST(req: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    return new Response(
      "Ask AI is not configured (OPENROUTER_API_KEY not set)",
      {
        status: 503,
      },
    );
  }

  const reqJson = await req.json();
  const flowId = reqJson.flowId;

  let effectiveSystemPrompt = systemPrompt;
  if (isChatFlowId(flowId)) {
    effectiveSystemPrompt = [systemPrompt, getFlowSystemPrompt(flowId)].join(
      "\n\n",
    );
  }

  const result = streamText({
    model: getOpenRouterChatModel(),
    system: effectiveSystemPrompt,
    stopWhen: stepCountIs(5),
    tools: {
      search: searchTool,
      setTitle: setTitleTool,
      suggestFollowups: suggestFollowupsTool,
    },
    messages: await convertToModelMessages<ChatUIMessage>(
      reqJson.messages ?? [],
      {
        convertDataPart(part) {
          if (part.type === "data-client") {
            return {
              type: "text",
              text: `[Client Context: ${JSON.stringify(part.data)}]`,
            };
          }
        },
      },
    ),
    toolChoice: "auto",
  });

  return result.toUIMessageStreamResponse();
}
