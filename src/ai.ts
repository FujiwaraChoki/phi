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

// Custom event types to expose tool execution to UI
export type CustomStreamEvent =
  | MessageStreamEvent
  | { type: "tool_execution_start"; tool_use_id: string; tool_name: string }
  | { type: "tool_execution_end"; tool_use_id: string; result: string; is_error: boolean };

const streamResponse = async function* (
  authenticatedClient: Anthropic,
  prompt: string,
  chatId: string,
): AsyncGenerator<CustomStreamEvent> {
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
          text: "You are Claude Code, Anthropic's official CLI for Claude.",
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

    // Execute all tools sequentially and collect results
    const toolResultContents: ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const toolFn = toolMap[toolUse.name];

      // Notify UI that tool execution is starting
      yield {
        type: "tool_execution_start" as const,
        tool_use_id: toolUse.id,
        tool_name: toolUse.name,
      };

      if (!toolFn) {
        const errorResult: ToolResultBlockParam = {
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: `Error: Unknown tool ${toolUse.name}`,
          is_error: true,
        };

        yield {
          type: "tool_execution_end" as const,
          tool_use_id: toolUse.id,
          result: errorResult.content as string,
          is_error: true,
        };

        toolResultContents.push(errorResult);
        continue;
      }

      try {
        const result = await toolFn(toolUse.input as any);
        // Ensure result is a string
        const content = typeof result === "string" ? result : JSON.stringify(result);

        yield {
          type: "tool_execution_end" as const,
          tool_use_id: toolUse.id,
          result: content,
          is_error: false,
        };

        toolResultContents.push({
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content,
        });
      } catch (error) {
        const errorContent = `Error: ${(error as Error).message}`;

        yield {
          type: "tool_execution_end" as const,
          tool_use_id: toolUse.id,
          result: errorContent,
          is_error: true,
        };

        toolResultContents.push({
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: errorContent,
          is_error: true,
        });
      }
    }

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
