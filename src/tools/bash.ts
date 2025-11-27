import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod.js";
import { spawn } from "node:child_process";

// Maximum output buffer size (10MB)
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

// Default timeout in seconds
const DEFAULT_TIMEOUT = 60;

// Determine the shell to use
function getShell(): string {
  if (process.platform === "win32") {
    // Try to find Git Bash on Windows
    const gitBashPaths = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ];
    for (const path of gitBashPaths) {
      try {
        if (Bun.file(path).size) {
          return path;
        }
      } catch {
        // Path doesn't exist, continue
      }
    }
    return "cmd.exe";
  }
  return process.env.SHELL || "/bin/sh";
}

const bashTool = betaZodTool({
  name: "bash",
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
    timeout: z.number().optional().describe(`Timeout in seconds (default: ${DEFAULT_TIMEOUT})`),
    workdir: z.string().optional().describe("Working directory for the command (default: current directory)"),
  }),
  description: "Execute a bash command in the shell. Use this for running builds, tests, git commands, package managers, and other CLI operations. Output is captured and returned.",
  run: async (input) => {
    const { command, timeout = DEFAULT_TIMEOUT, workdir } = input;

    return new Promise((resolve) => {
      const shell = getShell();
      const isWindows = process.platform === "win32" && !shell.includes("bash");

      let stdout = "";
      let stderr = "";
      let killed = false;

      const args = isWindows ? ["/c", command] : ["-c", command];

      const child = spawn(shell, args, {
        cwd: workdir || process.cwd(),
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill("SIGKILL");
      }, timeout * 1000);

      // Capture stdout
      child.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length <= MAX_OUTPUT_SIZE) {
          stdout += chunk;
        }
      });

      // Capture stderr
      child.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length <= MAX_OUTPUT_SIZE) {
          stderr += chunk;
        }
      });

      child.on("close", (code) => {
        clearTimeout(timeoutId);

        // Build output
        let output = "";

        if (killed) {
          output += `[Command timed out after ${timeout}s]\n\n`;
        }

        if (stdout) {
          output += stdout;
        }

        if (stderr) {
          if (output && !output.endsWith("\n")) {
            output += "\n";
          }
          output += stderr;
        }

        if (!output) {
          output = "(no output)";
        }

        // Add exit code info if non-zero
        if (code !== 0 && code !== null && !killed) {
          output += `\n\n[Exit code: ${code}]`;
        }

        resolve(output);
      });

      child.on("error", (error) => {
        clearTimeout(timeoutId);
        resolve(`Error executing command: ${error.message}`);
      });
    });
  },
});

export default bashTool;
