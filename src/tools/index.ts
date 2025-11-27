import webSearchTool from "./web-search";
import fileSearchTool from "./file-search";
import readFileTool from "./read-file";
import writeFileTool from "./write-file";
import editFileTool from "./edit-file";
import bashTool from "./bash";
import globTool from "./glob";
import grepTool from "./grep";
import todoTool from "./todo";

// All available tools
export const allTools = [
  readFileTool,
  writeFileTool,
  editFileTool,
  bashTool,
  globTool,
  grepTool,
  webSearchTool,
  todoTool,
];

// Tool map for looking up tools by name
export const toolMap = {
  [readFileTool.name]: readFileTool.run,
  [writeFileTool.name]: writeFileTool.run,
  [editFileTool.name]: editFileTool.run,
  [bashTool.name]: bashTool.run,
  [globTool.name]: globTool.run,
  [grepTool.name]: grepTool.run,
  [webSearchTool.name]: webSearchTool.run,
  [todoTool.name]: todoTool.run,
};

// Individual exports
export {
  webSearchTool,
  fileSearchTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  bashTool,
  globTool,
  grepTool,
  todoTool,
};
