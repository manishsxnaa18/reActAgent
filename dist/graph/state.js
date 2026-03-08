"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentState = void 0;
const langgraph_1 = require("@langchain/langgraph");
exports.AgentState = langgraph_1.Annotation.Root({
    messages: (0, langgraph_1.Annotation)({
        reducer: (current, update) => current.concat(update),
        default: () => []
    }),
    pendingToolCalls: (0, langgraph_1.Annotation)({
        reducer: (_current, update) => (typeof update === "undefined" ? _current : update),
        default: () => null
    })
});
