import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod.js";

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

interface TodoList {
  id: string;
  title: string;
  items: TodoItem[];
}

// In-memory storage for todo lists
const todoLists = new Map<string, TodoList>();
let currentTodoId: string | null = null;

// Generate a simple ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

const todoTool = betaZodTool({
  name: "todo",
  inputSchema: z.object({
    action: z.enum(["create", "add", "complete", "uncomplete", "remove", "get", "list_all"]).describe(
      "Action to perform: 'create' a new todo list, 'add' an item, 'complete' an item, 'uncomplete' an item, 'remove' an item, 'get' the current list, or 'list_all' to see all todo lists"
    ),
    todoId: z.string().optional().describe(
      "ID of the todo list to operate on. If not provided, uses the current active todo list."
    ),
    title: z.string().optional().describe("Title for the todo list (required when action is 'create')"),
    text: z.string().optional().describe("Text for the todo item (required when action is 'add')"),
    itemId: z.string().optional().describe("ID of the item to complete/uncomplete/remove (required for those actions)"),
  }),
  description:
    "Manage in-memory todo lists for tracking tasks during the conversation. Create lists, add items, mark items as complete/incomplete, remove items, or view current state. Use this for any task that requires tracking multiple steps or significant effort.",
  run: async (input) => {
    const { action, todoId, title, text, itemId } = input;

    try {
      switch (action) {
        case "create": {
          if (!title) {
            return "Error: 'title' is required when creating a new todo list";
          }

          const newTodoList: TodoList = {
            id: generateId(),
            title,
            items: [],
          };

          todoLists.set(newTodoList.id, newTodoList);
          currentTodoId = newTodoList.id;

          return `Created new todo list "${title}" with ID: ${newTodoList.id}\n\nThis is now the active todo list.`;
        }

        case "add": {
          if (!text) {
            return "Error: 'text' is required when adding a todo item";
          }

          const listId = todoId || currentTodoId;
          if (!listId) {
            return "Error: No todo list found. Create one first using action='create'";
          }

          const todoList = todoLists.get(listId);
          if (!todoList) {
            return `Error: Todo list with ID '${listId}' not found`;
          }

          const newItem: TodoItem = {
            id: generateId(),
            text,
            completed: false,
          };

          todoList.items.push(newItem);

          return `Added item to "${todoList.title}":\n  [${newItem.id}] ${text}\n\nCurrent list (${todoList.items.length} items):\n${formatTodoList(todoList)}`;
        }

        case "complete":
        case "uncomplete": {
          if (!itemId) {
            return `Error: 'itemId' is required when marking an item as ${action === "complete" ? "complete" : "incomplete"}`;
          }

          const listId = todoId || currentTodoId;
          if (!listId) {
            return "Error: No todo list found";
          }

          const todoList = todoLists.get(listId);
          if (!todoList) {
            return `Error: Todo list with ID '${listId}' not found`;
          }

          const item = todoList.items.find(i => i.id === itemId);
          if (!item) {
            return `Error: Item with ID '${itemId}' not found in list "${todoList.title}"`;
          }

          item.completed = action === "complete";

          return `Marked item as ${action === "complete" ? "complete" : "incomplete"}: ${item.text}\n\nCurrent list:\n${formatTodoList(todoList)}`;
        }

        case "remove": {
          if (!itemId) {
            return "Error: 'itemId' is required when removing an item";
          }

          const listId = todoId || currentTodoId;
          if (!listId) {
            return "Error: No todo list found";
          }

          const todoList = todoLists.get(listId);
          if (!todoList) {
            return `Error: Todo list with ID '${listId}' not found`;
          }

          const itemIndex = todoList.items.findIndex(i => i.id === itemId);
          if (itemIndex === -1) {
            return `Error: Item with ID '${itemId}' not found in list "${todoList.title}"`;
          }

          const removedItem = todoList.items[itemIndex];
          todoList.items.splice(itemIndex, 1);

          return `Removed item: ${removedItem.text}\n\nCurrent list (${todoList.items.length} items):\n${formatTodoList(todoList)}`;
        }

        case "get": {
          const listId = todoId || currentTodoId;
          if (!listId) {
            return "No todo list found. Create one first using action='create'";
          }

          const todoList = todoLists.get(listId);
          if (!todoList) {
            return `Error: Todo list with ID '${listId}' not found`;
          }

          return formatTodoList(todoList);
        }

        case "list_all": {
          if (todoLists.size === 0) {
            return "No todo lists found.";
          }

          let result = `Found ${todoLists.size} todo list(s):\n\n`;

          for (const [id, todoList] of todoLists) {
            const completed = todoList.items.filter(i => i.completed).length;
            const total = todoList.items.length;
            const isActive = id === currentTodoId ? " (active)" : "";
            result += `[${id}]${isActive} ${todoList.title} (${completed}/${total} complete)\n`;
          }

          return result;
        }

        default:
          return `Error: Unknown action '${action}'`;
      }
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  },
});

function formatTodoList(todoList: TodoList): string {
  const completed = todoList.items.filter(i => i.completed).length;
  const total = todoList.items.length;

  let result = `Todo List: ${todoList.title} (${completed}/${total} complete)\n`;
  result += `ID: ${todoList.id}\n\n`;

  if (todoList.items.length === 0) {
    result += "  (no items)\n";
  } else {
    todoList.items.forEach((item, index) => {
      const checkbox = item.completed ? "[✓]" : "[ ]";
      result += `  ${checkbox} ${item.text}\n`;
      result += `      ID: ${item.id}\n`;
    });
  }

  return result;
}

export default todoTool;
