import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { getAsciiArt } from "./utils";
import { useState, useEffect, useRef } from "react";
import { check } from "./authentication";
import Anthropic from "@anthropic-ai/sdk";
import { streamResponse } from "./ai";
import { saveChat, getPreviousChats, getChat, deleteChat, ensureChatsDir, initializeChat, saveToken, saveTavilyKey, getTavilyKey } from "./local-data";
import type { MessageParam } from "@anthropic-ai/sdk/resources";
import type { SelectOption } from "@opentui/core";
import spinners from "cli-spinners";
import { COLORS } from "./theme";
import { UserMessage } from "./components/UserMessage";
import { ContentBlockComponent } from "./components/ContentBlock";
import type { Message, AssistantMessage as AssistantMsg, ContentBlock, TextContent, ToolCallContent } from "./types";
import notifier from "node-notifier";

const phiAsciiArt = await getAsciiArt("phi");

let client: Anthropic;

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
      <span fg={COLORS.accent}>{spinner.frames[frame]}</span>
      {" "}
      <span fg={COLORS.muted}>Thinking...</span>
    </text>
  );
};

// Status bar component
const StatusBar = ({
  isStreaming,
  focusMode,
  messageCount,
}: {
  isStreaming: boolean;
  focusMode: "scroll" | "input";
  messageCount: number;
}) => {
  const { width } = useTerminalDimensions();

  const modeText = isStreaming ? "streaming..." : focusMode === "input" ? "input" : "scroll";
  const helpText = "ESC: toggle focus • /new /load /delete";

  return (
    <box style={{
      height: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingLeft: 1,
      paddingRight: 1,
    }}>
      <text>
        <span fg={COLORS.muted}>[{modeText}]</span>
        {" "}
        <span fg={COLORS.dimmed}>{messageCount} messages</span>
      </text>
      <text>
        <span fg={COLORS.muted}>{helpText}</span>
      </text>
    </box>
  );
};

const App = () => {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingBlocks, setStreamingBlocks] = useState<ContentBlock[]>([]);
  const [chatId, setChatId] = useState<string>(() => crypto.randomUUID());
  const [chatTitle, setChatTitle] = useState("");
  const [showSelector, setShowSelector] = useState(false);
  const [selectorMode, setSelectorMode] = useState<"load" | "delete" | null>(null);
  const [chatOptions, setChatOptions] = useState<SelectOption[]>([]);
  const [focusMode, setFocusMode] = useState<"scroll" | "input">("input");
  const scrollRef = useRef<any>(null);

  // Initialize chat file on mount
  useEffect(() => {
    initializeChat(chatId);
  }, [chatId]);

  // Auto-scroll during streaming
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      // Scroll to bottom when streaming
      scrollRef.current.scrollToBottom?.();
    }
  }, [isStreaming, streamingBlocks, messages]);

  // Handle keyboard for focus switching
  useKeyboard((key) => {
    if (key.name === "escape") {
      if (showSelector) {
        setShowSelector(false);
        setSelectorMode(null);
        setChatOptions([]);
      } else if (focusMode === "input") {
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
        setChatId(crypto.randomUUID());
        setMessages([]);
        setChatTitle("");
        setInputValue("");
        return;
      }

      if (command === "/load") {
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
          } catch {
            // Skip invalid chats
          }
        }

        if (options.length === 0) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: [{ type: "text", text: "No saved chats found." }],
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
          } catch {
            // Skip invalid chats
          }
        }

        if (options.length === 0) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: [{ type: "text", text: "No saved chats found." }],
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
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: `Unknown command: ${value}\n\nAvailable commands:\n- /new - Start a new chat\n- /load - Load a saved chat\n- /delete - Delete a saved chat`,
            },
          ],
        },
      ]);
      setInputValue("");
      return;
    }

    // Add user message
    const userMessage: Message = { role: "user", content: value };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsStreaming(true);
    setStreamingBlocks([]);

    try {
      const contentBlocks: ContentBlock[] = [];

      for await (const event of streamResponse(client, value, chatId)) {
        // Handle content_block_start - blocks arrive in ORDER
        if (event.type === "content_block_start") {
          if (event.content_block?.type === "tool_use") {
            const toolBlock: ToolCallContent = {
              type: "tool_use",
              id: event.content_block.id,
              name: event.content_block.name,
              input: {},
              apiIndex: event.index, // Store API's index
            };
            contentBlocks.push(toolBlock);
            setStreamingBlocks([...contentBlocks]);
          } else if (event.content_block?.type === "text") {
            const textBlock: TextContent = {
              type: "text",
              text: "",
              apiIndex: event.index, // Store API's index
            };
            contentBlocks.push(textBlock);
            setStreamingBlocks([...contentBlocks]);
          }
        }

        // Handle content_block_delta - use findIndex to locate by apiIndex
        if (event.type === "content_block_delta") {
          if (event.delta?.type === "text_delta") {
            const blockIndex = contentBlocks.findIndex((b) => b.apiIndex === event.index);
            const block = contentBlocks[blockIndex] as TextContent | undefined;
            if (block && block.type === "text") {
              block.text += event.delta.text;
              setStreamingBlocks([...contentBlocks]);
            }
          } else if (event.delta?.type === "input_json_delta") {
            const blockIndex = contentBlocks.findIndex((b) => b.apiIndex === event.index);
            const block = contentBlocks[blockIndex] as ToolCallContent | undefined;
            if (block && block.type === "tool_use") {
              // Parse the partial JSON directly (it's cumulative, not a delta)
              try {
                block.input = JSON.parse(event.delta.partial_json);
              } catch {
                // Partial JSON, will complete later
              }
              setStreamingBlocks([...contentBlocks]);
            }
          }
        }

        // Handle tool execution start
        if (event.type === "tool_execution_start") {
          const toolBlock = contentBlocks.find(
            (b) => b.type === "tool_use" && b.id === event.tool_use_id
          ) as ToolCallContent | undefined;
          if (toolBlock) {
            toolBlock.isExecuting = true;
            setStreamingBlocks([...contentBlocks]);
          }
        }

        // Handle tool execution end
        if (event.type === "tool_execution_end") {
          const toolBlock = contentBlocks.find(
            (b) => b.type === "tool_use" && b.id === event.tool_use_id
          ) as ToolCallContent | undefined;
          if (toolBlock) {
            toolBlock.isExecuting = false;
            toolBlock.result = event.result;
            toolBlock.isError = event.is_error;
            setStreamingBlocks([...contentBlocks]);
          }
        }

        // Handle message_stop
        if (event.type === "message_stop") {
          // Clean up apiIndex from blocks before saving
          const cleanedBlocks = contentBlocks.map(block => {
            const { apiIndex, ...rest } = block as any;
            return rest;
          });

          const assistantMessage: AssistantMsg = {
            role: "assistant",
            content: cleanedBlocks,
          };

          setMessages((prev) => {
            const updated = [...prev, assistantMessage];

            const title = chatTitle || value.slice(0, 50);
            setChatTitle(title);

            // Convert to Anthropic MessageParam format for saving
            const paramsToSave: MessageParam[] = updated.map(msg => {
              if (msg.role === "user") {
                return { role: "user", content: msg.content };
              } else {
                // Convert content blocks back to strings for simple storage
                const textContent = msg.content
                  .filter(b => b.type === "text")
                  .map(b => (b as TextContent).text)
                  .join("\n");
                return { role: "assistant", content: textContent };
              }
            });

            saveChat({
              id: chatId,
              title: title,
              messages: paramsToSave,
            });

            return updated;
          });

          setStreamingBlocks([]);
          setIsStreaming(false);

          // Send notification when agent completes
          notifier.notify({
            title: "Phi",
            message: "Agent response complete",
            sound: false,
            wait: false,
          });
        }
      }
    } catch (error) {
      console.error("Error streaming response:", error);
      const errorMessage: AssistantMsg = {
        role: "assistant",
        content: [{ type: "text", text: "Error: " + (error as Error).message }],
      };
      setMessages((prev) => [...prev, errorMessage]);
      setStreamingBlocks([]);

      // Notify on error too
      notifier.notify({
        title: "Phi",
        message: "Error occurred",
        sound: false,
        wait: false,
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSelectorChange = async (index: number, option: SelectOption | null) => {
    if (!option || !selectorMode) return;

    if (selectorMode === "load") {
      try {
        const chat = await getChat(option.value as string);
        setChatId(chat.id);
        // Convert loaded messages to our format
        setMessages(chat.messages.map((m) => {
          if (m.role === "user") {
            return { role: "user", content: typeof m.content === "string" ? m.content : "" };
          } else {
            return {
              role: "assistant",
              content: [{ type: "text", text: typeof m.content === "string" ? m.content : "" }],
            };
          }
        }));
        setChatTitle(chat.title);
      } catch (error) {
        setMessages([
          {
            role: "assistant",
            content: [{ type: "text", text: `Error loading chat: ${(error as Error).message}` }],
          },
        ]);
      }
    } else if (selectorMode === "delete") {
      try {
        await deleteChat(option.value as string);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: [{ type: "text", text: `Deleted chat: ${option.name}` }],
          },
        ]);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: [{ type: "text", text: `Error deleting chat: ${(error as Error).message}` }],
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
        width: "100%",
      }}
    >
      {/* Main content area */}
      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          alignItems: "center",
          paddingTop: 1,
          paddingLeft: 2,
          paddingRight: 2,
        }}
      >
        <box
          style={{
            flexDirection: "column",
            width: "80%",
            height: "100%",
          }}
        >
          {/* Header - Only show when no messages */}
          {messages.length === 0 && (
            <box style={{ marginBottom: 1, alignItems: "center" }}>
              <text fg={COLORS.accent}>{phiAsciiArt}</text>
            </box>
          )}

          {/* Messages - Scrollable */}
          <scrollbox
            ref={scrollRef}
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
            {/* Render completed messages */}
            {messages.map((msg, idx) => {
              if (msg.role === "user") {
                return <UserMessage key={idx} content={msg.content} isFirst={idx === 0} />;
              } else {
                // Assistant message - render content blocks in order
                return (
                  <box key={idx} style={{ flexDirection: "column" }}>
                    {msg.content.map((block, blockIdx) => (
                      <ContentBlockComponent key={blockIdx} block={block} />
                    ))}
                  </box>
                );
              }
            })}

            {/* Render streaming content blocks */}
            {isStreaming && streamingBlocks.length > 0 && (
              <box style={{ flexDirection: "column" }}>
                {streamingBlocks.map((block, blockIdx) => (
                  <ContentBlockComponent key={blockIdx} block={block} />
                ))}
              </box>
            )}

            {/* Show loading spinner when waiting for first content */}
            {isStreaming && streamingBlocks.length === 0 && (
              <box style={{ marginTop: 1 }}>
                <LoadingSpinner />
              </box>
            )}
          </scrollbox>

          {/* Selector */}
          {showSelector && chatOptions.length > 0 && (
            <box
              style={{
                border: true,
                borderStyle: "rounded",
                borderColor: COLORS.accent,
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
              borderColor: focusMode === "input" ? COLORS.accent : COLORS.muted,
              height: 3,
              padding: 0,
            }}
          >
            <input
              placeholder="Ask me anything..."
              focused={focusMode === "input" && !isStreaming && !showSelector}
              value={inputValue}
              onInput={setInputValue}
              onSubmit={handleSubmit}
              disabled={isStreaming || showSelector}
            />
          </box>
        </box>
      </box>

      {/* Status bar */}
      <StatusBar
        isStreaming={isStreaming}
        focusMode={focusMode}
        messageCount={messages.length}
      />
    </box>
  );
};

// Helper to prompt for input
const prompt = async (question: string): Promise<string> => {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

// Prompt for Anthropic token
const promptForToken = async (): Promise<string> => {
  console.log("\n\x1b[36m" + phiAsciiArt + "\x1b[0m\n");
  console.log("Welcome to Phi! Let's get you set up.\n");
  console.log("To get your Anthropic API key:");
  console.log("  1. Go to https://console.anthropic.com/");
  console.log("  2. Sign in or create an account");
  console.log("  3. Go to API Keys and create a new key\n");

  return await prompt("Enter your Anthropic API key: ");
};

// Prompt for Tavily API key (optional)
const promptForTavilyKey = async (): Promise<string> => {
  console.log("\n\x1b[36m[Optional]\x1b[0m Web search requires a Tavily API key.");
  console.log("To get one:");
  console.log("  1. Go to https://tavily.com/");
  console.log("  2. Sign up for a free account");
  console.log("  3. Copy your API key\n");
  console.log("Press Enter to skip if you don't need web search.\n");

  return await prompt("Enter your Tavily API key (or press Enter to skip): ");
};

// Main Loop
const main = async () => {
  let token = await check();
  let isFirstRun = false;

  if (!token) {
    isFirstRun = true;
    token = await promptForToken();

    if (!token) {
      console.error("\nNo token provided. Exiting.");
      process.exit(1);
    }

    // Validate token by trying to create a client
    try {
      const testClient = new Anthropic({
        apiKey: token,
        dangerouslyAllowBrowser: true,
      });
      // Quick validation - just check that the client can be created
      // A real validation would make an API call, but that costs money
    } catch (error) {
      console.error("\nInvalid token format. Please try again.");
      process.exit(1);
    }

    // Save the token
    await saveToken(token);
    console.log("\n\x1b[36m✓\x1b[0m Anthropic API key saved to ~/.phi/config.json");
  }

  // Check for Tavily key on first run
  if (isFirstRun) {
    const tavilyKey = await promptForTavilyKey();
    if (tavilyKey) {
      await saveTavilyKey(tavilyKey);
      console.log("\x1b[36m✓\x1b[0m Tavily API key saved to ~/.phi/config.json");
    } else {
      console.log("\x1b[36m⚠\x1b[0m Skipped Tavily setup. Web search will be unavailable.");
    }
    console.log("");
  }

  // Ensure chats directory exists
  await ensureChatsDir();

  // Detect OAuth token (starts with sk-ant-oat)
  const isOAuthToken = token.includes("sk-ant-oat");

  const defaultHeaders = {
    accept: "application/json",
    "anthropic-dangerous-direct-browser-access": "true",
    "anthropic-beta": isOAuthToken
      ? "oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14"
      : "fine-grained-tool-streaming-2025-05-14",
  };

  // Create Anthropic client with appropriate authentication
  if (isOAuthToken) {
    client = new Anthropic({
      apiKey: null as any,
      authToken: token,
      defaultHeaders,
      dangerouslyAllowBrowser: true,
    });
  } else {
    client = new Anthropic({
      apiKey: token,
      defaultHeaders,
      dangerouslyAllowBrowser: true,
    });
  }

  const renderer = await createCliRenderer();
  createRoot(renderer).render(<App />);
};

main();
