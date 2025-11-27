import { COLORS } from "../theme";

type UserMessageProps = {
  content: string;
  isFirst?: boolean;
};

export const UserMessage = ({ content, isFirst }: UserMessageProps) => {
  return (
    <box style={{ flexDirection: "column", marginTop: isFirst ? 0 : 1 }}>
      <box
        style={{
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.userBorder,
          padding: 1,
          backgroundColor: COLORS.userBg,
        }}
      >
        <text fg={COLORS.userText}>{content}</text>
      </box>
    </box>
  );
};
