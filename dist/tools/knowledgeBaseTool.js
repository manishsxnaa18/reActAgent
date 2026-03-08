"use strict";
/**
 * Company Knowledge Base Tool
 * Allows the agent to query the RAG system for company information
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeBaseTool = void 0;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const ingestionService_1 = require("../rag/ingestionService");
/**
 * Tool for querying company knowledge base (RAG system)
 */
exports.knowledgeBaseTool = new tools_1.DynamicStructuredTool({
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
    schema: zod_1.z.object({
        query: zod_1.z.string().describe("The question to search in the company knowledge base")
    }),
    func: async ({ query }, _runManager, _config) => {
        try {
            console.log(`🔍 Querying company knowledge base: "${query}"`);
            // For structured data queries, retrieve more context
            const isStructuredQuery = /^(?:order|id|billing|invoice|transaction|row|record)/i.test(query);
            const topK = isStructuredQuery ? 10 : 5;
            // Search the vector database
            const context = await ingestionService_1.ingestionService.query(query, topK);
            if (context.includes("No relevant information found")) {
                return "I couldn't find relevant information in the company knowledge base. The information might not have been uploaded yet, or you might want to try rephrasing your question.";
            }
            return `Here's what I found in the company knowledge base:\n\n${context}`;
        }
        catch (error) {
            console.error("Error querying knowledge base:", error);
            return `Error accessing company knowledge base: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
});
