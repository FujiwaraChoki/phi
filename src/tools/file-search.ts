import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod.js";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const fileSearchTool = betaZodTool({
  name: "file_search",
  inputSchema: z.object({
    pattern: z.string().describe("Search pattern (file name or glob-like pattern to match)"),
    directory: z.string().optional().describe("Directory to search in (default: current directory)"),
    maxDepth: z.number().optional().describe("Maximum depth to search (default: 3)"),
    includeHidden: z.boolean().optional().describe("Include hidden files/directories (default: false)"),
  }),
  description: "Search for files in the current directory or a specified directory. Supports pattern matching in file names.",
  run: async (input) => {
    const { pattern, directory = ".", maxDepth = 3, includeHidden = false } = input;

    try {
      const searchDir = directory;
      const results: string[] = [];

      // Convert pattern to regex (simple glob-like support)
      const patternRegex = new RegExp(
        pattern
          .replace(/\./g, "\\.")
          .replace(/\*/g, ".*")
          .replace(/\?/g, "."),
        "i"
      );

      async function searchRecursive(dir: string, depth: number) {
        if (depth > maxDepth) return;

        try {
          const entries = await readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            // Skip hidden files/directories if not included
            if (!includeHidden && entry.name.startsWith(".")) continue;

            const fullPath = join(dir, entry.name);
            const relativePath = relative(searchDir, fullPath);

            if (entry.isDirectory()) {
              // Recursively search subdirectories
              await searchRecursive(fullPath, depth + 1);
            } else if (entry.isFile()) {
              // Check if file name matches pattern
              if (patternRegex.test(entry.name)) {
                results.push(relativePath);
              }
            }
          }
        } catch (error) {
          // Skip directories we don't have permission to read
          return;
        }
      }

      await searchRecursive(searchDir, 0);

      if (results.length === 0) {
        return `No files found matching pattern "${pattern}" in ${searchDir}`;
      }

      let output = `Found ${results.length} file(s) matching "${pattern}":\n\n`;
      results.sort();
      results.forEach((file, index) => {
        output += `${index + 1}. ${file}\n`;
      });

      return output;
    } catch (error) {
      return `Error searching files: ${(error as Error).message}`;
    }
  },
});

export default fileSearchTool;
