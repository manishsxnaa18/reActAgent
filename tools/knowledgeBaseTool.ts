/**
 * Company Knowledge Base Tool
 * Allows the agent to query the RAG system for company information
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { ingestionService } from "../rag/ingestionService";

/**
 * Tool for querying company knowledge base (RAG system)
 */
export const knowledgeBaseTool = new DynamicStructuredTool({
  name: "query_company_knowledge",
  description: `Query the company knowledge base for information about company policies, balance sheets, financial data, internal documents, CSV data, and other company-specific information. 
  Use this tool when the user asks about:
  - Company policies, procedures, or guidelines
  - Financial information (balance sheets, P&L statements)
  - Company history or background
  - Internal documentation
  - Product information stored in company documents
  - Lookup information in tables or CSV files (order details, billing info, etc.)
  - Any question that requires company-specific knowledge
  
  Do NOT use this for:
  - Current events or news (use web_search instead)
  - Calendar queries (use calendar tools instead)
  - General knowledge questions`,
  
  schema: z.object({
    query: z.string().describe("The question to search in the company knowledge base")
  }) as any,
  func: async (
    { query }: { query: string },
    _runManager?: CallbackManagerForToolRun,
    _config?: RunnableConfig
  ) => {
    try {
      console.log(`🔍 Querying company knowledge base: "${query}"`);
      
      // For structured data queries, retrieve more context
      const isStructuredQuery = /^(?:order|id|billing|invoice|transaction|row|record)/i.test(query);
      const topK = isStructuredQuery ? 10 : 5;
      
      // Search the vector database
      const context = await ingestionService.query(query, topK);
      
      if (context.includes("No relevant information found")) {
        return "I couldn't find relevant information in the company knowledge base. The information might not have been uploaded yet, or you might want to try rephrasing your question.";
      }
      
      return `Here's what I found in the company knowledge base:\n\n${context}`;
    } catch (error) {
      console.error("Error querying knowledge base:", error);
      return `Error accessing company knowledge base: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
});
