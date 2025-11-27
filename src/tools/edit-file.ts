import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod.js";
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

// Generate a unified diff-style output showing the changes
function generateDiff(
  oldContent: string,
  newContent: string,
  path: string
): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  // Find the first line that differs
  let startIdx = 0;
  while (
    startIdx < oldLines.length &&
    startIdx < newLines.length &&
    oldLines[startIdx] === newLines[startIdx]
  ) {
    startIdx++;
  }

  // Find the last line that differs
  let oldEndIdx = oldLines.length - 1;
  let newEndIdx = newLines.length - 1;
  while (
    oldEndIdx > startIdx &&
    newEndIdx > startIdx &&
    oldLines[oldEndIdx] === newLines[newEndIdx]
  ) {
    oldEndIdx--;
    newEndIdx--;
  }

  // Build the diff output
  const contextLines = 3;
  const contextStart = Math.max(0, startIdx - contextLines);
  const oldContextEnd = Math.min(oldLines.length - 1, oldEndIdx + contextLines);
  const newContextEnd = Math.min(newLines.length - 1, newEndIdx + contextLines);

  let diff = `--- ${path}\n+++ ${path}\n`;
  diff += `@@ -${contextStart + 1},${oldContextEnd - contextStart + 1} +${contextStart + 1},${newContextEnd - contextStart + 1} @@\n`;

  // Context before
  for (let i = contextStart; i < startIdx; i++) {
    diff += ` ${oldLines[i]}\n`;
  }

  // Removed lines (old)
  for (let i = startIdx; i <= oldEndIdx; i++) {
    diff += `-${oldLines[i]}\n`;
  }

  // Added lines (new)
  for (let i = startIdx; i <= newEndIdx; i++) {
    diff += `+${newLines[i]}\n`;
  }

  // Context after
  const afterStart = oldEndIdx + 1;
  const afterEnd = Math.min(oldLines.length, afterStart + contextLines);
  for (let i = afterStart; i < afterEnd; i++) {
    diff += ` ${oldLines[i]}\n`;
  }

  return diff;
}

const editFileTool = betaZodTool({
  name: "edit_file",
  inputSchema: z.object({
    path: z.string().describe("The file path to edit (supports ~ for home directory)"),
    old_string: z.string().describe("The exact string to find and replace (must be unique in the file)"),
    new_string: z.string().describe("The string to replace it with"),
  }),
  description: "Edit a file by replacing an exact string with another. The old_string must appear exactly once in the file. Use this for precise, surgical edits rather than rewriting entire files.",
  run: async (input) => {
    const { path, old_string, new_string } = input;

    try {
      const fullPath = expandPath(path);
      const file = Bun.file(fullPath);

      // Check if file exists
      if (!(await file.exists())) {
        return `Error: File not found: ${path}`;
      }

      // Read current content
      const content = await file.text();

      // Check for exact match
      if (!content.includes(old_string)) {
        // Try to be helpful about what went wrong
        const trimmedOld = old_string.trim();
        if (content.includes(trimmedOld)) {
          return `Error: The exact string was not found, but a trimmed version was found. Make sure whitespace matches exactly.\n\nSearched for:\n${JSON.stringify(old_string)}\n\nFound similar:\n${JSON.stringify(trimmedOld)}`;
        }
        return `Error: String not found in file. The old_string must match exactly (including whitespace and newlines).\n\nSearched for:\n${old_string.slice(0, 200)}${old_string.length > 200 ? "..." : ""}`;
      }

      // Check for uniqueness
      const occurrences = content.split(old_string).length - 1;
      if (occurrences > 1) {
        return `Error: Found ${occurrences} occurrences of the string. The old_string must be unique. Add more surrounding context to make it unique.`;
      }

      // Check if old_string equals new_string
      if (old_string === new_string) {
        return "Error: old_string and new_string are identical. No changes needed.";
      }

      // Perform the replacement (using manual replacement to avoid regex issues)
      const idx = content.indexOf(old_string);
      const newContent =
        content.slice(0, idx) + new_string + content.slice(idx + old_string.length);

      // Write the new content
      await Bun.write(fullPath, newContent);

      // Generate and return diff
      const diff = generateDiff(content, newContent, path);
      return `File edited successfully.\n\n${diff}`;
    } catch (error) {
      return `Error editing file: ${(error as Error).message}`;
    }
  },
});

export default editFileTool;
