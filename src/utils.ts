// Embedded ASCII art for compiled binary support
const ASCII_ART: Record<string, string> = {
  phi: `     ###########
   ###         ###
  ##             ##
 ##      ###      ##
 ##      ###      ##
 ##      ###      ##
  ##             ##
   ###         ###
     ###########`,
};

/**
 * Gets the ASCII art for a given icon name.
 *
 * @param {string} name - The name of the icon.
 * @returns {Promise<string>} - The ASCII art as a string.
 */
const getAsciiArt = async (name: string): Promise<string> => {
  return ASCII_ART[name] || "";
};

export { getAsciiArt };
