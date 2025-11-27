import type { ContentBlock } from "../types";
import { AssistantMessage } from "./AssistantMessage";
import { ToolExecution } from "./ToolExecution";

type ContentBlockProps = {
  block: ContentBlock;
};

export const ContentBlockComponent = ({ block }: ContentBlockProps) => {
  if (block.type === "text") {
    return <AssistantMessage content={block.text} />;
  }

  if (block.type === "tool_use") {
    return <ToolExecution tool={block} />;
  }

  return null;
};
