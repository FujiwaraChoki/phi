import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import { Glob } from "bun";

import type { Chat } from "../types";

const HOME_DIR = homedir();
const CHATS_DIR = `${HOME_DIR}/.phi/chats`;

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
