# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Phi is an open-source AI coding agent that provides a terminal-based chat interface powered by Claude via Anthropic SDK. It uses OpenTUI for rendering a React-based TUI (Terminal User Interface).

## Running the Application

```bash
bun run start  # Runs src/index.tsx
```

## Authentication

The application requires `ANTHROPIC_AUTH_TOKEN` environment variable. Run `claude setup-token` to get the token.

## Architecture

### Core Components

- **src/index.tsx**: Main application entry point
  - React-based TUI using OpenTUI
  - Manages chat state and streaming
  - Auto-saves conversations to `~/.phi/chats/{chatId}.json`
  - Each session generates a unique UUID for the chat

- **src/ai.ts**: Anthropic API integration
  - `streamResponse()`: Async generator that yields streaming events from Claude
  - Uses `authenticatedClient.beta.messages.stream()` for streaming responses
  - Includes web search tool integration
  - Model: `claude-sonnet-4-5-20250929`

- **src/local-data.ts**: Chat persistence layer
  - `saveChat()`: Saves chat to `~/.phi/chats/{chatId}.json`
  - `getChat()`: Loads existing chat by ID
  - `getPreviousChats()`: Lists all chat IDs
  - `deleteChat()`: Removes a chat file

- **src/authentication.ts**: Validates `ANTHROPIC_AUTH_TOKEN` environment variable

- **src/tools/**: Claude tool definitions
  - Tools use `betaZodTool` from Anthropic SDK
  - Input schemas defined with Zod
  - Currently includes web search tool (stub implementation)

### Data Flow

1. User submits message via input component
2. Message added to local state as `MessageParam`
3. `streamResponse()` called with client, prompt, and chatId
4. Stream events processed (`content_block_delta` -> `text_delta`)
5. Streaming content displayed in real-time
6. On completion, full response added to messages
7. Chat automatically saved via `saveChat()` with all messages

### UI Architecture

- Built with OpenTUI React components (`<box>`, `<text>`, `<input>`)
- Single green accent color (`#00ff88`) for branding
- Compact, minimal design with 70% max width
- Loading spinner uses `cli-spinners` package (`dots12` spinner)
- Message format: `"You: message"` / `"Phi: response"`

## Runtime & Tooling

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

### Bun APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Key Dependencies

- `@anthropic-ai/sdk`: Claude API client
- `@opentui/core` & `@opentui/react`: Terminal UI framework
- `@tavily/core`: Web search integration (planned)
- `cli-spinners`: Loading animations
- `zod`: Schema validation for tools

## Type System

- `MessageParam`: Anthropic SDK type for chat messages (role + content)
- `Chat`: Custom type with id, title, and messages array
- Content can be string or array of content blocks (handle both)
