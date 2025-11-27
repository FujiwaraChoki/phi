// Content block types that can appear in assistant messages
export type TextContent = {
  type: "text";
  text: string;
};

export type ToolCallContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, any>;
  // UI-only fields for execution state
  isExecuting?: boolean;
  result?: string;
  isError?: boolean;
};

export type ContentBlock = TextContent | ToolCallContent;

// Our message structure that matches Claude's API
export type UserMessage = {
  role: "user";
  content: string;
};

export type AssistantMessage = {
  role: "assistant";
  content: ContentBlock[];
};

export type Message = UserMessage | AssistantMessage;
