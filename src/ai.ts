import Anthropic from "@anthropic-ai/sdk";
import { getChat, saveChat } from "./local-data";
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources";
import type { Model } from "@anthropic-ai/sdk/resources";
import { allTools, toolMap } from "./tools";
import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import type { ToolUseBlock, TextBlock } from "@anthropic-ai/sdk/resources/messages";

const MODEL_TO_USE: Model = "claude-sonnet-4-5-20250929";

// Use the tools from the centralized index (cast to any to avoid type incompatibility with beta tools)
const tools = allTools as any;

// System prompt for the coding assistant
const SYSTEM_PROMPT = `You are Phi, an AI coding assistant running in the terminal. You help users with software engineering tasks including writing code, debugging, refactoring, and explaining code.

## Available Tools

You have access to powerful tools for interacting with the filesystem and running commands:

- **read_file**: Read file contents with optional offset/limit for large files
- **write_file**: Create or overwrite files (creates parent directories automatically)
- **edit_file**: Make precise edits using exact string replacement (preferred for small changes)
- **bash**: Execute shell commands (builds, tests, git, package managers, etc.)
- **glob**: Find files matching patterns (e.g., "**/*.ts", "src/**/*.js")
- **grep**: Search file contents for patterns (supports regex)
- **web_search**: Search the web for current information

## Guidelines

1. **Read before editing**: Always read a file before modifying it to understand its structure
2. **Use edit_file for small changes**: For surgical edits (changing a few lines), use edit_file with exact string matching
3. **Use write_file for new files or complete rewrites**: When creating new files or rewriting large portions
4. **Explain your changes**: Briefly describe what you're doing and why
5. **Run tests and builds**: After making changes, run relevant tests if available
6. **Be careful with destructive operations**: Confirm before deleting files or making irreversible changes

## Code Style

- Match the existing code style in the project
- Don't add unnecessary comments or documentation
- Keep changes focused and minimal
- Don't over-engineer solutions

## Current Working Directory

You are running in the user's current working directory. Use relative paths when possible.

Today's date: ${new Date().toISOString().split("T")[0]}
`;

const streamResponse = async function* (
  authenticatedClient: Anthropic,
  prompt: string,
  chatId: string,
): AsyncGenerator<MessageStreamEvent> {
  let previousMessages: MessageParam[] = [];

  if (chatId) {
    const chat = await getChat(chatId);
    previousMessages = chat.messages;
  }

  let messages: MessageParam[] = [...previousMessages, { role: "user" as const, content: prompt }];

  // Tool use loop - continue until we get a non-tool response
  while (true) {
    const stream = authenticatedClient.messages.stream({
      model: MODEL_TO_USE,
      max_tokens: 8192,
      messages,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: {
            type: "ephemeral",
          },
        },
      ],
      tools,
    });

    // Stream all events
    for await (const event of stream) {
      yield event;
    }

    // Get final message
    const finalMessage = await stream.finalMessage();

    // Check if the response contains tool uses
    const toolUses = finalMessage.content.filter(
      (block): block is ToolUseBlock => block.type === "tool_use"
    );

    if (toolUses.length === 0) {
      // No tool uses, we're done - save and exit
      if (chatId) {
        const chat = await getChat(chatId);
        saveChat({
          ...chat,
          messages,
        });
      }
      break;
    }

    // Add assistant message with tool uses to conversation
    messages.push({
      role: "assistant" as const,
      content: finalMessage.content,
    });

    // Execute all tools and collect results
    const toolResultContents: ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (toolUse): Promise<ToolResultBlockParam> => {
        const toolFn = toolMap[toolUse.name];

        if (!toolFn) {
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: `Error: Unknown tool ${toolUse.name}`,
            is_error: true,
          };
        }

        try {
          const result = await toolFn(toolUse.input as any);
          // Ensure result is a string
          const content = typeof result === "string" ? result : JSON.stringify(result);
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content,
          };
        } catch (error) {
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: `Error: ${(error as Error).message}`,
            is_error: true,
          };
        }
      })
    );

    const toolResults: MessageParam = {
      role: "user" as const,
      content: toolResultContents,
    };

    // Add tool results to conversation
    messages.push(toolResults);

    // Continue the loop to get the next response
  }
};

export { streamResponse };
