import "../loadEnv";
import { TavilySearch } from "@langchain/tavily";
import { tool } from "@langchain/core/tools";

console.log('TAVILY_API_KEY', process.env.TAVILY_API_KEY);
const tavily = new TavilySearch({ maxResults: 3});

export const webSearchTool = tool(
  async (query: string) => {
    console.log('webSearchTool', query);
    const results = await tavily.invoke({ query });
    return JSON.stringify(results);
  },
  {
    name: "web_search",
    description: "Search the web for current events, sports, news, factual data."
  }
);

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
