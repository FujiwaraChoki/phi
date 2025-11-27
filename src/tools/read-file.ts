import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod.js";
import { homedir } from "node:os";
import { resolve, extname } from "node:path";

// Image MIME types for binary file detection
const IMAGE_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

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

// Check if file is an image
function isImageFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext in IMAGE_MIME_TYPES;
}

const readFileTool = betaZodTool({
  name: "read_file",
  inputSchema: z.object({
    path: z.string().describe("The file path to read (supports ~ for home directory)"),
    offset: z.number().optional().describe("Line number to start reading from (1-indexed, default: 1)"),
    limit: z.number().optional().describe("Maximum number of lines to read (default: 2000)"),
  }),
  description: "Read the contents of a file. Use offset and limit for large files. Supports text files and images.",
  run: async (input) => {
    const { path, offset = 1, limit = 2000 } = input;
    const MAX_LINES = 2000;
    const MAX_LINE_LENGTH = 2000;

    try {
      const fullPath = expandPath(path);
      const file = Bun.file(fullPath);

      // Check if file exists
      if (!(await file.exists())) {
        return `Error: File not found: ${path}`;
      }

      // Handle image files
      if (isImageFile(fullPath)) {
        const ext = extname(fullPath).toLowerCase();
        const mimeType = IMAGE_MIME_TYPES[ext];
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        return `[Image file: ${path}]\nMIME type: ${mimeType}\nBase64 data: ${base64.slice(0, 100)}... (truncated for display)`;
      }

      // Read text file
      const content = await file.text();
      const lines = content.split("\n");
      const totalLines = lines.length;

      // Validate offset
      const startLine = Math.max(1, offset);
      if (startLine > totalLines) {
        return `Error: Offset ${offset} exceeds file length (${totalLines} lines)`;
      }

      // Apply offset and limit
      const effectiveLimit = Math.min(limit, MAX_LINES);
      const startIdx = startLine - 1;
      const endIdx = Math.min(startIdx + effectiveLimit, totalLines);
      const selectedLines = lines.slice(startIdx, endIdx);

      // Format output with line numbers
      let output = "";
      const lineNumberWidth = String(endIdx).length;

      selectedLines.forEach((line, idx) => {
        const lineNum = startIdx + idx + 1;
        const paddedLineNum = String(lineNum).padStart(lineNumberWidth, " ");

        // Truncate long lines
        let displayLine = line;
        let truncated = false;
        if (line.length > MAX_LINE_LENGTH) {
          displayLine = line.slice(0, MAX_LINE_LENGTH);
          truncated = true;
        }

        output += `${paddedLineNum}\t${displayLine}${truncated ? " [truncated]" : ""}\n`;
      });

      // Add info about remaining content
      const remainingLines = totalLines - endIdx;
      if (remainingLines > 0) {
        output += `\n[${remainingLines} more lines. Use offset=${endIdx + 1} to continue reading]`;
      }

      return output;
    } catch (error) {
      return `Error reading file: ${(error as Error).message}`;
    }
  },
});

export default readFileTool;
