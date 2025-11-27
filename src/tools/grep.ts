import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod.js";
import { Glob } from "bun";
import { homedir } from "node:os";
import { resolve } from "node:path";

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
  ".next",
  ".nuxt",
  "vendor",
]);

// Binary file extensions to skip
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".svg",
  ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".exe", ".dll", ".so", ".dylib",
  ".woff", ".woff2", ".ttf", ".eot",
  ".sqlite", ".db",
]);

type SearchResult = {
  file: string;
  line: number;
  column: number;
  content: string;
};

const grepTool = betaZodTool({
  name: "grep",
  inputSchema: z.object({
    pattern: z.string().describe("Search pattern (regex or literal string)"),
    path: z.string().optional().describe("Directory or file to search in (default: current directory)"),
    glob: z.string().optional().describe("File pattern to filter (e.g., '*.ts', '*.{js,jsx}')"),
    caseInsensitive: z.boolean().optional().describe("Case insensitive search (default: false)"),
    contextLines: z.number().optional().describe("Number of context lines before and after match (default: 0)"),
    maxResults: z.number().optional().describe("Maximum number of matches to return (default: 50)"),
    includeHidden: z.boolean().optional().describe("Include hidden files (default: false)"),
  }),
  description: "Search for a pattern in file contents. Supports regex patterns. Returns matching lines with file paths and line numbers.",
  run: async (input) => {
    const {
      pattern,
      path = ".",
      glob: fileGlob = "**/*",
      caseInsensitive = false,
      contextLines = 0,
      maxResults = 50,
      includeHidden = false,
    } = input;

    try {
      const searchDir = expandPath(path);
      const globPattern = new Glob(fileGlob);

      // Create regex from pattern
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, caseInsensitive ? "gi" : "g");
      } catch {
        // If regex is invalid, treat as literal string
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        regex = new RegExp(escaped, caseInsensitive ? "gi" : "g");
      }

      const results: SearchResult[] = [];
      let filesSearched = 0;
      const maxFiles = 1000;

      // Scan for matching files
      for await (const file of globPattern.scan({
        cwd: searchDir,
        onlyFiles: true,
        dot: includeHidden,
      })) {
        if (filesSearched >= maxFiles) break;

        // Skip files in excluded directories
        const pathParts = file.split("/");
        if (pathParts.some((part) => DEFAULT_EXCLUDED_DIRS.has(part))) {
          continue;
        }

        // Skip hidden files if not included
        if (!includeHidden && pathParts.some((part) => part.startsWith("."))) {
          continue;
        }

        // Skip binary files
        const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          continue;
        }

        filesSearched++;

        try {
          const fullPath = resolve(searchDir, file);
          const bunFile = Bun.file(fullPath);
          const content = await bunFile.text();
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            regex.lastIndex = 0; // Reset regex state

            let match;
            while ((match = regex.exec(line)) !== null) {
              results.push({
                file,
                line: i + 1,
                column: match.index + 1,
                content: line.trim().slice(0, 200), // Truncate long lines
              });

              if (results.length >= maxResults) break;
            }

            if (results.length >= maxResults) break;
          }

          if (results.length >= maxResults) break;
        } catch {
          // Skip files that can't be read
        }
      }

      if (results.length === 0) {
        return `No matches found for "${pattern}" in ${abbreviatePath(searchDir)}`;
      }

      // Format output
      let output = `Found ${results.length}${results.length >= maxResults ? "+" : ""} matches for "${pattern}":\n\n`;

      // Group by file
      const byFile = new Map<string, SearchResult[]>();
      for (const result of results) {
        const existing = byFile.get(result.file) || [];
        existing.push(result);
        byFile.set(result.file, existing);
      }

      for (const [file, fileResults] of byFile) {
        output += `${file}:\n`;
        for (const result of fileResults) {
          output += `  ${result.line}:${result.column}: ${result.content}\n`;
        }
        output += "\n";
      }

      if (results.length >= maxResults) {
        output += `[Results limited to ${maxResults} matches. Use more specific pattern or path to narrow search]`;
      }

      return output;
    } catch (error) {
      return `Error searching: ${(error as Error).message}`;
    }
  },
});

export default grepTool;
