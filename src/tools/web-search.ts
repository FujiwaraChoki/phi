import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod.js";
import { tavily, type TavilyClient } from "@tavily/core";

// Lazily initialize Tavily client
let tavilyClient: TavilyClient | null = null;

function getTavilyClient(): TavilyClient | null {
  if (tavilyClient) return tavilyClient;
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  tavilyClient = tavily({ apiKey });
  return tavilyClient;
}

const webSearchTool = betaZodTool({
  name: "web_search",
  inputSchema: z.object({
    query: z.string().describe("The search query to look up on the web"),
    maxResults: z.number().optional().describe("Maximum number of results to return (default: 5)"),
    searchDepth: z.enum(["basic", "advanced"]).optional().describe("Search depth: basic or advanced (default: basic)"),
  }),
  description: "Search the web for current information using Tavily. Use this when you need up-to-date information, facts, news, or data that may not be in your training data.",
  run: async (input) => {
    const { query, maxResults = 5, searchDepth = "basic" } = input;

    try {
      const response = await tavilyClient.search(query, {
        searchDepth,
        maxResults,
        includeAnswer: true,
        includeRawContent: false,
      });

      // Format the results for Claude
      let result = `Search results for "${query}":\n\n`;

      // Include AI-generated answer if available
      if (response.answer) {
        result += `Summary: ${response.answer}\n\n`;
      }

      // Include search results
      result += `Sources:\n`;
      response.results.forEach((item, index) => {
        result += `\n${index + 1}. ${item.title}\n`;
        result += `   URL: ${item.url}\n`;
        result += `   ${item.content}\n`;
      });

      return result;
    } catch (error) {
      return `Error performing web search: ${(error as Error).message}`;
    }
  },
});

export default webSearchTool;
