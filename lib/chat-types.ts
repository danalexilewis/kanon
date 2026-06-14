import type { UIMessage } from "ai";
import { isChatFlowId, type ChatFlowId } from "@/lib/chat-flows";

export type ChatMessageMetadata = {
  flowId?: ChatFlowId;
};

export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  {
    client: {
      location: string;
    };
  }
>;

export function getMessageFlowId(message: {
  metadata?: ChatMessageMetadata;
}): ChatFlowId | null {
  const flowId = message.metadata?.flowId;
  if (flowId && isChatFlowId(flowId)) return flowId;
  return null;
}
