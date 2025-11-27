import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import { Glob } from "bun";

import type { Chat } from "../types";

const HOME_DIR = homedir();
const PHI_DIR = `${HOME_DIR}/.phi`;
const CHATS_DIR = `${PHI_DIR}/chats`;
const CONFIG_FILE = `${PHI_DIR}/config.json`;

type Config = {
  anthropicToken?: string;
  tavilyApiKey?: string;
};

/**
 * Ensures the phi directory exists.
 */
export const ensurePhiDir = async () => {
  try {
    await mkdir(PHI_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
};

/**
 * Gets the config from ~/.phi/config.json
 */
export const getConfig = async (): Promise<Config> => {
  await ensurePhiDir();
  try {
    const file = Bun.file(CONFIG_FILE);
    if (await file.exists()) {
      return JSON.parse(await file.text());
    }
  } catch {
    // Config doesn't exist or is invalid
  }
  return {};
};

/**
 * Saves the config to ~/.phi/config.json
 */
export const saveConfig = async (config: Config) => {
  await ensurePhiDir();
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
};

/**
 * Gets the Anthropic token from config
 */
export const getToken = async (): Promise<string | undefined> => {
  const config = await getConfig();
  return config.anthropicToken;
};

/**
 * Saves the Anthropic token to config
 */
export const saveToken = async (token: string) => {
  const config = await getConfig();
  config.anthropicToken = token;
  await saveConfig(config);
};

/**
 * Gets the Tavily API key from config
 */
export const getTavilyKey = async (): Promise<string | undefined> => {
  // First check config
  const config = await getConfig();
  if (config.tavilyApiKey) {
    return config.tavilyApiKey;
  }
  // Fall back to env var
  return Bun.env.TAVILY_API_KEY;
};

/**
 * Saves the Tavily API key to config
 */
export const saveTavilyKey = async (key: string) => {
  const config = await getConfig();
  config.tavilyApiKey = key;
  await saveConfig(config);
};

/**
 * Ensures the chats directory exists.
 */
export const ensureChatsDir = async () => {
  try {
    await mkdir(CHATS_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists or other error
  }
};

/**
 * Retrieves a list of previous chat IDs.
 * @returns An array of chat IDs.
 */
export const getPreviousChats = async () => {
  await ensureChatsDir();

  const glob = new Glob(`*`);

  let files = [];

  for await (const file of glob.scanSync(CHATS_DIR)) {
    files.push(file.toString().replace(".json", ""));
  }

  return files;
};

/**
 * Retrieves a chat by its ID.
 * @param chatId The ID of the chat to retrieve.
 * @returns The chat object.
 */
export const getChat = async (chatId: string): Promise<Chat> => {
  const chatData = await Bun.file(`${CHATS_DIR}/${chatId}.json`).text();

  const chat = JSON.parse(chatData);

  return chat;
};

/**
 * Initializes a new chat file with empty messages.
 * @param chatId The ID of the new chat.
 */
export const initializeChat = async (chatId: string) => {
  await ensureChatsDir();
  const newChat: Chat = {
    id: chatId,
    title: "",
    messages: [],
  };
  await Bun.write(`${CHATS_DIR}/${chatId}.json`, JSON.stringify(newChat));
};

/**
 * Saves a chat to the local storage.
 * @param chat The chat object to save.
 */
export const saveChat = async (chat: Chat) => {
  await ensureChatsDir();
  await Bun.write(`${CHATS_DIR}/${chat.id}.json`, JSON.stringify(chat));
};

/**
 * Deletes a chat from the local storage.
 * @param chatId The ID of the chat to delete.
 */
export const deleteChat = async (chatId: string) => {
  await Bun.file(`${CHATS_DIR}/${chatId}.json`).delete();
};
