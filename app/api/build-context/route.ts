import { generateText } from "ai";
import { buildContextSummarySystemPrompt } from "@/lib/build-context";
import { getOpenRouterChatModel } from "@/lib/openrouter-chat";

export async function POST(req: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    return new Response(
      "Ask AI is not configured (OPENROUTER_API_KEY not set)",
      {
        status: 503,
      },
    );
  }

  let body: { transcript?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const transcript =
    typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript) {
    return new Response("transcript is required", { status: 400 });
  }

  const { text } = await generateText({
    model: getOpenRouterChatModel(),
    system: buildContextSummarySystemPrompt,
    prompt: transcript,
  });

  return Response.json({ summary: text.trim() });
}
