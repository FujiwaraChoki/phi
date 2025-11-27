import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { getAsciiArt } from "./utils";
import { useState, useEffect } from "react";
import { check } from "./authentication";
import Anthropic from "@anthropic-ai/sdk";
import { streamResponse } from "./ai";
import { saveChat, getPreviousChats, getChat, deleteChat, ensureChatsDir, initializeChat } from "./local-data";
import type { MessageParam } from "@anthropic-ai/sdk/resources";
import type { SelectOption } from "@opentui/core";
import type { ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import spinners from "cli-spinners";
import { homedir } from "node:os";

const phiAsciiArt = await getAsciiArt("phi");

// Tool icons for different operations
const TOOL_ICONS: Record<string, string> = {
  read_file: "📖",
  write_file: "✏️",
  edit_file: "🔧",
  bash: "💻",
  glob: "🔍",
  grep: "🔎",
  web_search: "🌐",
  file_search: "📁",
};

// Abbreviate home directory in paths
function abbreviatePath(filePath: string): string {
  const home = homedir();
  if (filePath.startsWith(home)) {
    return "~" + filePath.slice(home.length);
  }
  return filePath;
}

// Get a display label for a tool invocation
function getToolLabel(tool: ToolUseBlock): string {
  const input = tool.input as Record<string, unknown>;
  const icon = TOOL_ICONS[tool.name] || "🔧";

  switch (tool.name) {
    case "read_file":
      return `${icon} Reading ${abbreviatePath(String(input.path || ""))}`;
    case "write_file":
      return `${icon} Writing ${abbreviatePath(String(input.path || ""))}`;
    case "edit_file":
      return `${icon} Editing ${abbreviatePath(String(input.path || ""))}`;
    case "bash":
      const cmd = String(input.command || "").slice(0, 50);
      return `${icon} ${cmd}${String(input.command || "").length > 50 ? "..." : ""}`;
    case "glob":
      return `${icon} Finding ${String(input.pattern || "")}`;
    case "grep":
      return `${icon} Searching for "${String(input.pattern || "").slice(0, 30)}"`;
    case "web_search":
      return `${icon} Searching: ${String(input.query || "").slice(0, 40)}`;
    default:
      return `${icon} ${tool.name}`;
  }
}

let client: Anthropic;

// Simple markdown renderer for text component
const MarkdownText = ({ content, showPrefix }: { content: string; showPrefix?: boolean }) => {
  const lines = content.split("\n");

  return (
    <>
      {lines.map((line, idx) => {
        const prefix = showPrefix && idx === 0 ? (
          <>
            <span fg="#00ff88" bold>Phi</span>
            {": "}
          </>
        ) : null;

        // Headers
        if (line.startsWith("### ")) {
          return (
            <text key={idx}>
              {prefix}
              <span fg="#00ff88" bold>{line.slice(4)}</span>
            </text>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <text key={idx}>
              {prefix}
              <span fg="#00ff88" bold>{line.slice(3)}</span>
            </text>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <text key={idx}>
              {prefix}
              <span fg="#00ff88" bold>{line.slice(2)}</span>
            </text>
          );
        }

        // Bold with ** or __
        if (line.includes("**") || line.includes("__")) {
          const parts = line.split(/(\*\*.*?\*\*|__.*?__)/g);
          return (
            <text key={idx}>
              {prefix}
              {parts.map((part, i) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                  return <span key={i} bold>{part.slice(2, -2)}</span>;
                }
                if (part.startsWith("__") && part.endsWith("__")) {
                  return <span key={i} bold>{part.slice(2, -2)}</span>;
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
              {prefix}
              <span fg="#FFA500">•</span> {line.slice(2)}
            </text>
          );
        }

        // Code blocks (inline)
        if (line.includes("`")) {
          const parts = line.split(/(`[^`]+`)/g);
          return (
            <text key={idx}>
              {prefix}
              {parts.map((part, i) => {
                if (part.startsWith("`") && part.endsWith("`")) {
                  return <span key={i} fg="#888888">{part.slice(1, -1)}</span>;
                }
                return part;
              })}
            </text>
          );
        }

        // Regular line
        return (
          <text key={idx}>
            {prefix}
            {line || " "}
          </text>
        );
      })}
    </>
  );
};

const LoadingSpinner = () => {
  const [frame, setFrame] = useState(0);
  const spinner = spinners.dots12;

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % spinner.frames.length);
    }, spinner.interval);
    return () => clearInterval(interval);
  }, []);

  return (
    <text>
      <span fg="#00ff88" bold>
        Phi
      </span>
      {": "}
      <span fg="#FFA500">{spinner.frames[frame]}</span>
    </text>
  );
};

type MessageWithTools = {
  message: MessageParam;
  toolInvocations: ToolUseBlock[];
};

const App = () => {
  const [inputValue, setInputValue] = useState("");
  const [messagesWithTools, setMessagesWithTools] = useState<MessageWithTools[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [chatId, setChatId] = useState(() => crypto.randomUUID());
  const [chatTitle, setChatTitle] = useState("");
  const [showSelector, setShowSelector] = useState(false);
  const [selectorMode, setSelectorMode] = useState<"load" | "delete" | null>(null);
  const [chatOptions, setChatOptions] = useState<SelectOption[]>([]);
  const [currentToolInvocations, setCurrentToolInvocations] = useState<ToolUseBlock[]>([]);
  const [currentToolUse, setCurrentToolUse] = useState<string>("");
  const [focusMode, setFocusMode] = useState<"scroll" | "input">("input");

  // Initialize chat file on mount
  useEffect(() => {
    initializeChat(chatId);
  }, [chatId]);

  // Handle keyboard for focus switching
  useKeyboard((key) => {
    if (key.name === "escape") {
      if (focusMode === "input") {
        setFocusMode("scroll");
      } else {
        setFocusMode("input");
      }
    }
  });

  const handleSubmit = async (value: string) => {
    if (!value.trim() || isStreaming) return;

    // Handle slash commands
    if (value.startsWith("/")) {
      const command = value.toLowerCase().trim();

      if (command === "/new") {
        // Start a new chat
        setChatId(crypto.randomUUID());
        setMessagesWithTools([]);
        setChatTitle("");
        setInputValue("");
        return;
      }

      if (command === "/load") {
        // Load chat selection
        const chats = await getPreviousChats();
        const options: SelectOption[] = [];

        for (const chatIdToLoad of chats) {
          try {
            const chat = await getChat(chatIdToLoad);
            options.push({
              name: chat.title || chatIdToLoad,
              description: `${chat.messages.length} messages`,
              value: chatIdToLoad,
            });
          } catch (error) {
            // Skip invalid chats
          }
        }

        if (options.length === 0) {
          setMessagesWithTools((prev) => [
            ...prev,
            {
              message: { role: "assistant", content: "No saved chats found." },
              toolInvocations: [],
            },
          ]);
          setInputValue("");
          return;
        }

        setChatOptions(options);
        setSelectorMode("load");
        setShowSelector(true);
        setInputValue("");
        return;
      }

      if (command === "/delete") {
        // Delete chat selection
        const chats = await getPreviousChats();
        const options: SelectOption[] = [];

        for (const chatIdToDelete of chats) {
          try {
            const chat = await getChat(chatIdToDelete);
            options.push({
              name: chat.title || chatIdToDelete,
              description: `${chat.messages.length} messages`,
              value: chatIdToDelete,
            });
          } catch (error) {
            // Skip invalid chats
          }
        }

        if (options.length === 0) {
          setMessagesWithTools((prev) => [
            ...prev,
            {
              message: { role: "assistant", content: "No saved chats found." },
              toolInvocations: [],
            },
          ]);
          setInputValue("");
          return;
        }

        setChatOptions(options);
        setSelectorMode("delete");
        setShowSelector(true);
        setInputValue("");
        return;
      }

      // Unknown command
      setMessagesWithTools((prev) => [
        ...prev,
        {
          message: {
            role: "assistant",
            content: `Unknown command: ${value}\n\nAvailable commands:\n/new - Start a new chat\n/load - Load a saved chat\n/delete - Delete a saved chat`,
          },
          toolInvocations: [],
        },
      ]);
      setInputValue("");
      return;
    }

    // Add user message
    const userMessage: MessageParam = { role: "user", content: value };
    setMessagesWithTools((prev) => [...prev, { message: userMessage, toolInvocations: [] }]);
    setInputValue("");
    setIsStreaming(true);
    setStreamingContent("");
    setCurrentToolUse("");
    setCurrentToolInvocations([]);

    try {
      let streamingText = "";
      const toolInvocations: ToolUseBlock[] = [];

      for await (const event of streamResponse(client, value, chatId)) {
        // Handle tool use blocks
        if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
          const toolBlock = event.content_block as ToolUseBlock;
          toolInvocations.push(toolBlock);
          setCurrentToolInvocations([...toolInvocations]);
        }

        // Handle streaming text
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          streamingText += event.delta.text;
          setStreamingContent(streamingText);
        }

        // Handle message_stop - indicates the end of streaming
        if (event.type === "message_stop") {
          // Add the assistant message with accumulated content
          const assistantMessage: MessageParam = {
            role: "assistant",
            content: streamingText || "",
          };

          setMessagesWithTools((prev) => {
            const updated = [
              ...prev,
              {
                message: assistantMessage,
                toolInvocations: toolInvocations,
              },
            ];

            // Save chat
            const title = chatTitle || value.slice(0, 50);
            setChatTitle(title);
            saveChat({
              id: chatId,
              title: title,
              messages: updated.map((m) => m.message),
            });

            return updated;
          });

          // Clear streaming state
          setStreamingContent("");
          setCurrentToolInvocations([]);
          setIsStreaming(false);
        }
      }
    } catch (error) {
      console.error("Error streaming response:", error);
      const errorMessage: MessageParam = {
        role: "assistant",
        content: "Error: " + (error as Error).message,
      };
      setMessagesWithTools((prev) => [...prev, { message: errorMessage, toolInvocations: [] }]);
      setCurrentToolInvocations([]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSelectorChange = async (index: number, option: SelectOption | undefined) => {
    if (!option || !selectorMode) return;

    if (selectorMode === "load") {
      try {
        const chat = await getChat(option.value as string);
        setChatId(chat.id);
        setMessagesWithTools(chat.messages.map((m) => ({ message: m, toolInvocations: [] })));
        setChatTitle(chat.title);
      } catch (error) {
        setMessagesWithTools([
          {
            message: { role: "assistant", content: `Error loading chat: ${(error as Error).message}` },
            toolInvocations: [],
          },
        ]);
      }
    } else if (selectorMode === "delete") {
      try {
        await deleteChat(option.value as string);
        setMessagesWithTools((prev) => [
          ...prev,
          {
            message: { role: "assistant", content: `Deleted chat: ${option.name}` },
            toolInvocations: [],
          },
        ]);
      } catch (error) {
        setMessagesWithTools((prev) => [
          ...prev,
          {
            message: { role: "assistant", content: `Error deleting chat: ${(error as Error).message}` },
            toolInvocations: [],
          },
        ]);
      }
    }

    setShowSelector(false);
    setSelectorMode(null);
    setChatOptions([]);
  };

  return (
    <box
      style={{
        flexDirection: "column",
        height: "100%",
        alignItems: "center",
        padding: 1,
      }}
    >
      <box
        style={{
          flexDirection: "column",
          width: "70%",
          height: "100%",
        }}
      >
        {/* Header - Only show when no messages */}
        {messagesWithTools.length === 0 && (
          <box style={{ marginBottom: 1 }}>
            <text fg="#00ff88">{phiAsciiArt}</text>
          </box>
        )}

        {/* Messages - Scrollable */}
        <scrollbox
          focused={focusMode === "scroll" && !isStreaming && !showSelector}
          style={{
            flexGrow: 1,
            rootOptions: {},
            wrapperOptions: {},
            viewportOptions: {},
            contentOptions: {
              flexDirection: "column",
              gap: 1,
            },
            scrollbarOptions: {
              showArrows: false,
            },
          }}
        >
          {messagesWithTools.map((item, idx) => {
            const isUser = item.message.role === "user";
            const content = typeof item.message.content === "string" ? item.message.content : "";
            const hasToolUses = item.toolInvocations.length > 0;

            return (
              <box key={idx} style={{ flexDirection: "column" }}>
                {isUser ? (
                  <text>
                    <span fg="#00ff88" bold>You</span>
                    {": "}
                    {content}
                  </text>
                ) : (
                  <>
                    {hasToolUses && item.toolInvocations.map((tool, toolIdx) => (
                      <text key={`tool-${toolIdx}`}>
                        <span fg="#888888">{getToolLabel(tool)}</span>
                      </text>
                    ))}
                    {content && (
                      <MarkdownText content={content} showPrefix />
                    )}
                  </>
                )}
              </box>
            );
          })}

          {/* Display current tool invocations while streaming */}
          {isStreaming && currentToolInvocations.length > 0 && currentToolInvocations.map((tool, toolIdx) => (
            <text key={`streaming-tool-${toolIdx}`}>
              <span fg="#FFA500">{getToolLabel(tool)}</span>
            </text>
          ))}

          {isStreaming && !streamingContent && !currentToolUse && (
            <box>
              <LoadingSpinner />
            </box>
          )}

          {isStreaming && streamingContent && (
            <MarkdownText content={streamingContent} showPrefix />
          )}
        </scrollbox>

        {/* Selector */}
        {showSelector && chatOptions.length > 0 && (
          <box
            style={{
              border: true,
              borderStyle: "rounded",
              borderColor: "#00ff88",
              height: Math.min(chatOptions.length + 2, 12),
              marginBottom: 1,
            }}
          >
            <select
              options={chatOptions}
              focused={true}
              onChange={handleSelectorChange}
              showScrollIndicator={chatOptions.length > 10}
              style={{
                flexGrow: 1,
              }}
            />
          </box>
        )}

        {/* Input */}
        <box
          style={{
            border: true,
            borderStyle: "rounded",
            borderColor: "#00ff88",
            height: 3,
            padding: 0,
          }}
        >
          <input
            placeholder="Something magical..."
            focused={focusMode === "input" && !isStreaming && !showSelector}
            value={inputValue}
            onInput={setInputValue}
            onSubmit={handleSubmit}
            disabled={isStreaming || showSelector}
            style={{
              fg: "#ffffff",
            }}
          />
        </box>
      </box>
    </box>
  );
};

// Main Loop
const main = async () => {
  const authenticated = await check();

  if (!authenticated) {
    console.error("Environment variable not set.");
    process.exit(1);
  }

  // Ensure chats directory exists
  await ensureChatsDir();

  const defaultHeaders = {
    accept: "application/json",
    "anthropic-dangerous-direct-browser-access": "true",
    "anthropic-beta": "oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14",
  };

  client = new Anthropic({
    defaultHeaders,
    dangerouslyAllowBrowser: true,
  });

  const renderer = await createCliRenderer();
  createRoot(renderer).render(<App />);
};

main();
