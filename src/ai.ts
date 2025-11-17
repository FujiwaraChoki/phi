import Anthropic from "@anthropic-ai/sdk";
import { getChat, saveChat } from "./local-data";
import type { MessageParam } from "@anthropic-ai/sdk/resources";
import type { Model } from "@anthropic-ai/sdk/resources";
import { webSearchTool, fileSearchTool } from "./tools";
import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import type { ToolUseBlock, TextBlock } from "@anthropic-ai/sdk/resources/messages";

const MODEL_TO_USE: Model = "claude-sonnet-4-5-20250929";

// Tool definitions array
const tools = [webSearchTool, fileSearchTool];

// Map of tool names to their run functions
const toolMap = {
  [webSearchTool.name]: webSearchTool.run,
  [fileSearchTool.name]: fileSearchTool.run,
};

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

  let messages = [...previousMessages, { role: "user", content: prompt }];

  // Tool use loop - continue until we get a non-tool response
  while (true) {
    const stream = authenticatedClient.messages.stream({
      model: MODEL_TO_USE,
      max_tokens: 4096,
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
      role: "assistant",
      content: finalMessage.content,
    });

    // Execute all tools and collect results
    const toolResults: MessageParam = {
      role: "user",
      content: await Promise.all(
        toolUses.map(async (toolUse) => {
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
            return {
              type: "tool_result" as const,
              tool_use_id: toolUse.id,
              content: result,
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
      ),
    };

    // Add tool results to conversation
    messages.push(toolResults);

    // Continue the loop to get the next response
  }
};

export { streamResponse };
