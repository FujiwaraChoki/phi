import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod.js";
import { Glob } from "bun";
import { homedir } from "node:os";
import { resolve, relative } from "node:path";
import { stat } from "node:fs/promises";

// Expand ~ to home directory
function expandPath(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return resolve(homedir(), filePath.slice(2));
  }
  if (filePath === "~") {
    return homedir();
  }
  return resolve(filePath);
}

// Abbreviate home directory in path
function abbreviatePath(filePath: string): string {
  const home = homedir();
  if (filePath.startsWith(home)) {
    return "~" + filePath.slice(home.length);
  }
  return filePath;
}

// Default directories to exclude from search
const DEFAULT_EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "coverage",
  ".cache",
  "__pycache__",
  ".pytest_cache",
  "venv",
  ".venv",
  "env",
  ".env",
  ".next",
  ".nuxt",
  "vendor",
]);

const globTool = betaZodTool({
  name: "glob",
  inputSchema: z.object({
    pattern: z.string().describe("Glob pattern to match files (e.g., '**/*.ts', 'src/**/*.js', '*.json')"),
    path: z.string().optional().describe("Directory to search in (default: current directory)"),
    includeHidden: z.boolean().optional().describe("Include hidden files and directories (default: false)"),
    excludeDirs: z.array(z.string()).optional().describe("Additional directories to exclude from search"),
    maxResults: z.number().optional().describe("Maximum number of results to return (default: 100)"),
  }),
  description: "Find files matching a glob pattern. Uses fast native glob matching. Returns file paths sorted by modification time.",
  run: async (input) => {
    const {
      pattern,
      path = ".",
      includeHidden = false,
      excludeDirs = [],
      maxResults = 100,
    } = input;

    try {
      const searchDir = expandPath(path);
      const glob = new Glob(pattern);

      // Collect all excluded directories
      const allExcluded = new Set([...DEFAULT_EXCLUDED_DIRS, ...excludeDirs]);

      // Scan for matching files
      const results: { path: string; mtime: number }[] = [];
      let scanned = 0;
      const maxScan = 10000; // Limit total files scanned

      for await (const file of glob.scan({
        cwd: searchDir,
        onlyFiles: true,
        dot: includeHidden,
      })) {
        scanned++;

        // Skip files in excluded directories
        const pathParts = file.split("/");
        const inExcluded = pathParts.some((part) => allExcluded.has(part));
        if (inExcluded) continue;

        // Skip hidden files if not included
        if (!includeHidden && pathParts.some((part) => part.startsWith("."))) {
          continue;
        }

        try {
          const fullPath = resolve(searchDir, file);
          const stats = await stat(fullPath);
          results.push({
            path: file,
            mtime: stats.mtimeMs,
          });
        } catch {
          // File might have been deleted, skip
        }

        // Stop if we've scanned too many files
        if (scanned >= maxScan) {
          break;
        }
      }

      if (results.length === 0) {
        return `No files found matching pattern "${pattern}" in ${abbreviatePath(searchDir)}`;
      }

      // Sort by modification time (most recent first)
      results.sort((a, b) => b.mtime - a.mtime);

      // Limit results
      const limitedResults = results.slice(0, maxResults);

      // Format output
      let output = `Found ${results.length} file(s) matching "${pattern}"`;
      if (results.length > maxResults) {
        output += ` (showing first ${maxResults})`;
      }
      output += `:\n\n`;

      limitedResults.forEach((file, idx) => {
        output += `${idx + 1}. ${file.path}\n`;
      });

      if (results.length > maxResults) {
        output += `\n[${results.length - maxResults} more files not shown]`;
      }

      return output;
    } catch (error) {
      return `Error searching files: ${(error as Error).message}`;
    }
  },
});

export default globTool;
