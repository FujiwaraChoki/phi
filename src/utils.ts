/**
 * Fetches the ASCII art for a given icon name.
 *
 * @param {string} name - The name of the icon.
 * @returns {Promise<string>} - The ASCII art as a string.
 */
const getAsciiArt = async (name: string): Promise<string> => {
  const asciiArt = Bun.file(`assets/icons/${name}.txt`);
  return await asciiArt.text();
};

export { getAsciiArt };
