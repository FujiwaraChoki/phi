const check = async () => {
  const token = Bun.env.ANTHROPIC_AUTH_TOKEN;

  return token !== undefined;
};

export { check };
