import { getToken } from "./local-data";

const check = async (): Promise<string | null> => {
  // First check config file
  const savedToken = await getToken();
  if (savedToken) {
    return savedToken;
  }

  // Fall back to environment variable for backwards compatibility
  const envToken = Bun.env.ANTHROPIC_AUTH_TOKEN;
  if (envToken) {
    return envToken;
  }

  return null;
};

export { check };
