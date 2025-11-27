import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod.js";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";

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

const writeFileTool = betaZodTool({
  name: "write_file",
  inputSchema: z.object({
    path: z.string().describe("The file path to write to (supports ~ for home directory)"),
    content: z.string().describe("The content to write to the file"),
  }),
  description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Creates parent directories automatically.",
  run: async (input) => {
    const { path, content } = input;

    try {
      const fullPath = expandPath(path);
      const dir = dirname(fullPath);

      // Create parent directories if needed
      await mkdir(dir, { recursive: true });

      // Write the file
      await Bun.write(fullPath, content);

      const lines = content.split("\n").length;
      const bytes = Buffer.byteLength(content, "utf8");

      return `Successfully wrote ${bytes} bytes (${lines} lines) to ${path}`;
    } catch (error) {
      return `Error writing file: ${(error as Error).message}`;
    }
  },
});

export default writeFileTool;
