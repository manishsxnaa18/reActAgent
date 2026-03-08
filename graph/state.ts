import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => []
  }),
  pendingToolCalls: Annotation<any[] | null>({
    reducer: (_current, update) => (typeof update === "undefined" ? _current : update),
    default: () => null
  })
});

export type AgentStateType = typeof AgentState.State;


