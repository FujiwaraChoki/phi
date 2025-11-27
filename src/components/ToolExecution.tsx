import { useState, useEffect } from "react";
import type { ToolCallContent } from "../types";
import { COLORS, abbreviatePath } from "../theme";
import spinners from "cli-spinners";

type ToolExecutionProps = {
  tool: ToolCallContent;
};

type ToolDisplayInfo = {
  action: string;
  subject?: string;
  details?: string[];
};

function getToolDisplay(tool: ToolCallContent): ToolDisplayInfo {
  const input = tool.input;

  switch (tool.name) {
    case "read_file": {
      const path = abbreviatePath(String(input.path || ""));
      const details = [];
      if (input.offset) details.push(`offset: ${input.offset}`);
      if (input.limit) details.push(`limit: ${input.limit}`);
      return { action: "Reading", subject: path, details };
    }
    case "write_file": {
      const path = abbreviatePath(String(input.path || ""));
      const content = String(input.content || "");
      const lines = content.split("\n").length;
      return { action: "Writing", subject: path, details: [`${lines} lines`] };
    }
    case "edit_file": {
      const path = abbreviatePath(String(input.path || ""));
      const oldStr = String(input.old_string || "");
      const newStr = String(input.new_string || "");
      return {
        action: "Editing",
        subject: path,
        details: [
          `replace: "${oldStr.slice(0, 30)}${oldStr.length > 30 ? "..." : ""}"`,
          `with: "${newStr.slice(0, 30)}${newStr.length > 30 ? "..." : ""}"`,
        ],
      };
    }
    case "bash": {
      const cmd = String(input.command || "");
      return { action: "Running", subject: cmd.length > 70 ? cmd.slice(0, 70) + "..." : cmd };
    }
    case "glob": {
      const pattern = String(input.pattern || "");
      const path = input.path ? abbreviatePath(String(input.path)) : undefined;
      const details = path ? [`in ${path}`] : [];
      return { action: "Searching files", subject: pattern, details };
    }
    case "grep": {
      const pattern = String(input.pattern || "");
      const details = [];
      if (input.path) details.push(`path: ${abbreviatePath(String(input.path))}`);
      if (input.glob) details.push(`glob: ${input.glob}`);
      if (input.output_mode && input.output_mode !== "files_with_matches") {
        details.push(`mode: ${input.output_mode}`);
      }
      return { action: "Searching", subject: pattern, details };
    }
    case "web_search": {
      const query = String(input.query || "");
      return { action: "Searching web", subject: query };
    }
    default:
      return { action: tool.name };
  }
}

const AnimatedSpinner = () => {
  const [frame, setFrame] = useState(0);
  const spinner = spinners.dots;

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % spinner.frames.length);
    }, spinner.interval);
    return () => clearInterval(interval);
  }, []);

  return <span fg={COLORS.warning}>{spinner.frames[frame]}</span>;
};

export const ToolExecution = ({ tool }: ToolExecutionProps) => {
  const { action, subject, details } = getToolDisplay(tool);

  // Status indicator
  const statusIndicator = tool.isExecuting ? (
    <AnimatedSpinner />
  ) : tool.isError ? (
    <span fg={COLORS.error}>●</span>
  ) : (
    <span fg={COLORS.success}>●</span>
  );

  return (
    <box style={{ flexDirection: "column", marginTop: 0, marginBottom: 0 }}>
      {/* Main tool line */}
      <text>
        {statusIndicator}
        {"  "}
        <span fg={COLORS.muted}>{action}</span>
        {subject && (
          <>
            {" "}
            <span fg={COLORS.accent}>{subject}</span>
          </>
        )}
      </text>

      {/* Details */}
      {details && details.length > 0 && (
        <box style={{ flexDirection: "column", marginLeft: 4 }}>
          {details.map((detail, idx) => (
            <text key={idx} fg={COLORS.dimmed}>
              {detail}
            </text>
          ))}
        </box>
      )}

      {/* Show result if available */}
      {tool.result && (
        <box style={{ flexDirection: "column", marginLeft: 4, marginTop: 0 }}>
          {tool.result.split("\n").slice(0, 8).map((line, idx) => (
            <text key={idx} fg={tool.isError ? COLORS.error : COLORS.toolOutput}>
              {line}
            </text>
          ))}
          {tool.result.split("\n").length > 8 && (
            <text fg={COLORS.dimmed}>
              ... +{tool.result.split("\n").length - 8} more lines
            </text>
          )}
        </box>
      )}
    </box>
  );
};
