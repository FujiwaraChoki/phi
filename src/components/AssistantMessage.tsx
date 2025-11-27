import { COLORS } from "../theme";

type AssistantMessageProps = {
  content: string;
};

export const AssistantMessage = ({ content }: AssistantMessageProps) => {
  if (!content.trim()) return null;

  const lines = content.split("\n");

  return (
    <box style={{ flexDirection: "column", marginTop: 1 }}>
      {lines.map((line, idx) => {
        // Headers
        if (line.startsWith("### ")) {
          return (
            <text key={idx} fg={COLORS.primary}>
              <b>{line.slice(4)}</b>
            </text>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <text key={idx} fg={COLORS.primary}>
              <b>{line.slice(3)}</b>
            </text>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <text key={idx} fg={COLORS.primary}>
              <b>{line.slice(2)}</b>
            </text>
          );
        }

        // Bold with ** or __
        if (line.includes("**") || line.includes("__")) {
          const parts = line.split(/(\*\*.*?\*\*|__.*?__)/g);
          return (
            <text key={idx}>
              {parts.map((part, i) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                  return <b key={i}>{part.slice(2, -2)}</b>;
                }
                if (part.startsWith("__") && part.endsWith("__")) {
                  return <b key={i}>{part.slice(2, -2)}</b>;
                }
                return part;
              })}
            </text>
          );
        }

        // List items
        if (line.match(/^[-*]\s/)) {
          return (
            <text key={idx}>
              <span fg={COLORS.accent}>•</span> {line.slice(2)}
            </text>
          );
        }

        // Code blocks (inline)
        if (line.includes("`")) {
          const parts = line.split(/(`[^`]+`)/g);
          return (
            <text key={idx}>
              {parts.map((part, i) => {
                if (part.startsWith("`") && part.endsWith("`")) {
                  return (
                    <span key={i} fg={COLORS.code}>
                      {part.slice(1, -1)}
                    </span>
                  );
                }
                return part;
              })}
            </text>
          );
        }

        // Regular line
        return <text key={idx}>{line || " "}</text>;
      })}
    </box>
  );
};
