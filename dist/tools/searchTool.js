"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSearchTool = void 0;
require("dotenv/config");
const tavily_1 = require("@langchain/tavily");
const tools_1 = require("@langchain/core/tools");
console.log('TAVILY_API_KEY', process.env.TAVILY_API_KEY);
const tavily = new tavily_1.TavilySearch({ maxResults: 3 });
exports.webSearchTool = (0, tools_1.tool)(async (query) => {
    console.log('webSearchTool', query);
    const results = await tavily.invoke({ query });
    return JSON.stringify(results);
}, {
    name: "web_search",
    description: "Search the web for current events, sports, news, factual data."
});
// export const webSearchTool = tool(
//   async (query: string) => {
//     console.log('webSearchTool', query);
//     try {
//     const results = await tavily.invoke({ query });
//     console.log('results', results);
//     return JSON.stringify(results);
//     } catch (error) {
//         console.error("Error in webSearchTool:", error);
//         return "Error in webSearchTool";
//     }
//   },
//   {
//     name: "web_search",
//     description: "Search the web for current events, sports, news, factual data."
//   }
// );
