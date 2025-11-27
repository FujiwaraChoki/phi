import { homedir } from "node:os";

// Claude-inspired color palette with teal/cyan accents
export const COLORS = {
  // Primary brand colors
  primary: "#8b9bb3",      // Claude's muted blue-gray
  accent: "#5fa8a8",       // Teal accent
  secondary: "#cc8866",    // Warm copper

  // Status colors
  success: "#98be87",      // Soft green
  error: "#ca6d6d",        // Soft red
  warning: "#e5c07b",      // Soft yellow

  // Text colors
  text: "#c9d1d9",         // Light gray text
  muted: "#8b949e",        // Muted gray
  dimmed: "#6e7681",       // Dimmed gray
  code: "#79c0ff",         // Code blue

  // User message
  userBg: "#2d333b",       // Darker background for user messages
  userBorder: "#444c56",   // Subtle border
  userText: "#c9d1d9",     // Light text

  // Tool backgrounds
  toolPendingBg: "#22272e",     // Very dark gray
  toolPendingBorder: "#373e47",  // Subtle border for pending
  toolSuccessBg: "#1a2b20",     // Dark green tint
  toolErrorBg: "#2b1e1e",       // Dark red tint

  // Tool text
  toolTitle: "#adbac7",         // Light gray for titles
  toolOutput: "#768390",        // Muted for output
};

// Abbreviate home directory in paths
export function abbreviatePath(filePath: string): string {
  const home = homedir();
  if (filePath.startsWith(home)) {
    return "~" + filePath.slice(home.length);
  }
  return filePath;
}
