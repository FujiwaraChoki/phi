import type { MessageParam } from "@anthropic-ai/sdk/resources";

export type Chat = {
  id: string;
  title: string | "";
  messages: MessageParam[];
};
