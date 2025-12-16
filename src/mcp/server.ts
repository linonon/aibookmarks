import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { BookmarkStoreManager } from '../store/bookmarkStore';
import { MCPHandlers } from './handlers';

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'create_group',
    description: 'Create a new bookmark group. Groups are used to organize bookmarks by topic or query.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Group name, e.g., "Crash game core flow"'
        },
        description: {
          type: 'string',
          description: 'Group description'
        },
        query: {
          type: 'string',
          description: 'The user query that triggered this group creation (for AI-generated groups)'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'add_bookmark',
    description: `Add a bookmark to a group. Bookmarks mark important code locations with explanations. Supports hierarchical bookmarks via parentId.

**IMPORTANT - Formatting Guidelines for AI:**
- title: Short, concise identifier (e.g., "handlePlaceBetRequest" or "下注核心入口")
- description: Detailed explanation WITHOUT repeating the title. Use clear formatting:
  - Start with a brief summary sentence
  - Use numbered steps for flows: "1) step one 2) step two"
  - Keep it focused and readable

**Example:**
- title: "handlePlaceBetRequest"
- description: "下注核心逻辑入口. 流程: 1) validatePlaceBetRequest 验证 2) CreateInitialBetOrder 创建订单 3) processWalletDebit 扣款"

DO NOT include the title text in the description - it will be displayed separately.

**HIERARCHY GUIDELINES - When to create child bookmarks (use parentId or add_child_bookmark):**
- Function A calls Function B → B should be CHILD of A
- Entry point with multiple steps → steps are CHILDREN of entry point
- High-level concept with implementation details → details are CHILDREN
- Caller → Callee relationship = Parent → Child relationship

**DO NOT flatten call chains into siblings with order 1, 2, 3!**
WRONG: 1. handleRequest, 2. validateInput, 3. processData (all siblings)
CORRECT: 1. handleRequest (parent) → 1.1 validateInput (child) → 1.2 processData (child)`,
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'The ID of the group to add the bookmark to'
        },
        parentId: {
          type: 'string',
          description: 'Parent bookmark ID. If not specified, creates a top-level bookmark'
        },
        location: {
          type: 'string',
          description: 'Location in format "path/to/file:line" or "path/to/file:start-end" for ranges'
        },
        title: {
          type: 'string',
          description: 'Short title (5-30 chars). DO NOT repeat in description.'
        },
        description: {
          type: 'string',
          description: 'Detailed explanation. DO NOT include title. Use: brief summary + numbered steps for flows.'
        },
        order: {
          type: 'number',
          description: 'Order within siblings (optional, appends to end if not specified)'
        },
        category: {
          type: 'string',
          enum: ['entry-point', 'core-logic', 'todo', 'bug', 'optimization', 'explanation', 'warning', 'reference'],
          description: 'Bookmark category'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for filtering'
        }
      },
      required: ['groupId', 'location', 'title', 'description']
    }
  },
  {
    name: 'add_child_bookmark',
    description: `Add a child bookmark under an existing bookmark. Creates hierarchical structure.

**USE THIS TOOL when the new bookmark represents:**
- A function/method CALLED BY the parent bookmark's function
- Implementation details of the parent concept
- A step that belongs under a parent flow
- Code that is logically "inside" or "part of" the parent

**Example scenarios:**
- Parent: "handlePlaceBet" → Child: "validateBetAmount" (called inside parent)
- Parent: "Authentication Flow" → Child: "Token Validation" (sub-step)
- Parent: "Database Layer" → Child: "Connection Pool Init" (component)

**Formatting:** Same as add_bookmark - title should be short, description should NOT repeat title.`,
    inputSchema: {
      type: 'object',
      properties: {
        parentBookmarkId: {
          type: 'string',
          description: 'The ID of the parent bookmark'
        },
        location: {
          type: 'string',
          description: 'Location in format "path/to/file:line" or "path/to/file:start-end" for ranges'
        },
        title: {
          type: 'string',
          description: 'Short title (5-30 chars). DO NOT repeat in description.'
        },
        description: {
          type: 'string',
          description: 'Detailed explanation. DO NOT include title. Use: brief summary + numbered steps for flows.'
        },
        order: {
          type: 'number',
          description: 'Order within siblings (optional, appends to end if not specified)'
        },
        category: {
          type: 'string',
          enum: ['entry-point', 'core-logic', 'todo', 'bug', 'optimization', 'explanation', 'warning', 'reference'],
          description: 'Bookmark category'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for filtering'
        }
      },
      required: ['parentBookmarkId', 'location', 'title', 'description']
    }
  },
  {
    name: 'list_groups',
    description: 'List all bookmark groups with their metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        createdBy: {
          type: 'string',
          enum: ['ai', 'user'],
          description: 'Filter by creator type'
        }
      }
    }
  },
  {
    name: 'list_bookmarks',
    description: 'List bookmarks with optional filters. Supports hierarchical filtering via parentId.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'Filter by group ID'
        },
        parentId: {
          type: 'string',
          description: 'Filter to only show children of the specified parent bookmark'
        },
        includeDescendants: {
          type: 'boolean',
          description: 'If true and parentId is specified, include all descendants (not just direct children)'
        },
        filePath: {
          type: 'string',
          description: 'Filter by file path (partial match)'
        },
        category: {
          type: 'string',
          enum: ['entry-point', 'core-logic', 'todo', 'bug', 'optimization', 'explanation', 'warning', 'reference'],
          description: 'Filter by category'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (any match)'
        }
      }
    }
  },
  {
    name: 'update_group',
    description: 'Update a bookmark group\'s name or description.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'The ID of the group to update'
        },
        name: {
          type: 'string',
          description: 'New group name'
        },
        description: {
          type: 'string',
          description: 'New group description'
        }
      },
      required: ['groupId']
    }
  },
  {
    name: 'update_bookmark',
    description: 'Update a bookmark\'s properties. Supports moving bookmark in hierarchy via parentId.',
    inputSchema: {
      type: 'object',
      properties: {
        bookmarkId: {
          type: 'string',
          description: 'The ID of the bookmark to update'
        },
        parentId: {
          type: ['string', 'null'],
          description: 'New parent bookmark ID. Set to null to move to top level. Circular references are prevented.'
        },
        location: {
          type: 'string',
          description: 'New location'
        },
        title: {
          type: 'string',
          description: 'New title'
        },
        description: {
          type: 'string',
          description: 'New description'
        },
        order: {
          type: 'number',
          description: 'New order within siblings'
        },
        category: {
          type: 'string',
          enum: ['entry-point', 'core-logic', 'todo', 'bug', 'optimization', 'explanation', 'warning', 'reference'],
          description: 'New category'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'New tags'
        }
      },
      required: ['bookmarkId']
    }
  },
  {
    name: 'remove_bookmark',
    description: 'Remove a bookmark by its ID. If the bookmark has children, all child bookmarks are also removed (cascade delete).',
    inputSchema: {
      type: 'object',
      properties: {
        bookmarkId: {
          type: 'string',
          description: 'The ID of the bookmark to remove'
        }
      },
      required: ['bookmarkId']
    }
  },
  {
    name: 'remove_group',
    description: 'Remove a bookmark group and all its bookmarks.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'The ID of the group to remove'
        }
      },
      required: ['groupId']
    }
  },
  {
    name: 'get_group',
    description: 'Get a single bookmark group with all its bookmarks. Returns both flat list and tree structure.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'The ID of the group to retrieve'
        }
      },
      required: ['groupId']
    }
  },
  {
    name: 'get_bookmark',
    description: 'Get a single bookmark by its ID with its group info and child count.',
    inputSchema: {
      type: 'object',
      properties: {
        bookmarkId: {
          type: 'string',
          description: 'The ID of the bookmark to retrieve'
        }
      },
      required: ['bookmarkId']
    }
  },
  {
    name: 'get_bookmark_tree',
    description: 'Get a bookmark and all its children as a tree structure.',
    inputSchema: {
      type: 'object',
      properties: {
        bookmarkId: {
          type: 'string',
          description: 'The ID of the bookmark to get tree for'
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth to traverse (optional, unlimited by default)'
        }
      },
      required: ['bookmarkId']
    }
  },
  {
    name: 'batch_add_bookmarks',
    description: `Add multiple bookmarks to a group in a single operation. More efficient than adding one by one.

**TIP:** Use parentId parameter to add multiple children under a parent bookmark efficiently.
Example: After creating a parent bookmark for "handleRequest", use batch_add_bookmarks with parentId to add all its sub-functions as children.

**Formatting Guidelines:** Same as add_bookmark - each bookmark's title should be short, description should NOT repeat title.`,
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'The ID of the group to add bookmarks to'
        },
        parentId: {
          type: 'string',
          description: 'Parent bookmark ID. All bookmarks in this batch will be added as children of this parent.'
        },
        bookmarks: {
          type: 'array',
          description: 'Array of bookmarks to add',
          items: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'Location in format "path/to/file:line" or "path/to/file:start-end"'
              },
              title: {
                type: 'string',
                description: 'Short title (5-30 chars). DO NOT repeat in description.'
              },
              description: {
                type: 'string',
                description: 'Detailed explanation. DO NOT include title.'
              },
              order: {
                type: 'number',
                description: 'Order within siblings (optional)'
              },
              category: {
                type: 'string',
                enum: ['entry-point', 'core-logic', 'todo', 'bug', 'optimization', 'explanation', 'warning', 'reference'],
                description: 'Bookmark category'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags for filtering'
              }
            },
            required: ['location', 'title', 'description']
          }
        }
      },
      required: ['groupId', 'bookmarks']
    }
  },
  {
    name: 'clear_all_bookmarks',
    description: 'Clear all bookmarks and groups. This is a destructive operation that requires explicit confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be set to true to confirm the operation. This prevents accidental data loss.'
        }
      },
      required: ['confirm']
    }
  }
];

export class MCPServer {
  private server: Server;
  private handlers: MCPHandlers;

  constructor(store: BookmarkStoreManager) {
    this.handlers = new MCPHandlers(store);
    this.server = new Server(
      {
        name: 'ai-bookmarks',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOLS };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      let result;
      switch (name) {
        case 'create_group':
          result = this.handlers.createGroup(args as unknown as Parameters<MCPHandlers['createGroup']>[0]);
          break;
        case 'add_bookmark':
          result = this.handlers.addBookmark(args as unknown as Parameters<MCPHandlers['addBookmark']>[0]);
          break;
        case 'add_child_bookmark':
          result = this.handlers.addChildBookmark(args as unknown as Parameters<MCPHandlers['addChildBookmark']>[0]);
          break;
        case 'list_groups':
          result = this.handlers.listGroups(args as unknown as Parameters<MCPHandlers['listGroups']>[0]);
          break;
        case 'list_bookmarks':
          result = this.handlers.listBookmarks(args as unknown as Parameters<MCPHandlers['listBookmarks']>[0]);
          break;
        case 'update_group':
          result = this.handlers.updateGroup(args as unknown as Parameters<MCPHandlers['updateGroup']>[0]);
          break;
        case 'update_bookmark':
          result = this.handlers.updateBookmark(args as unknown as Parameters<MCPHandlers['updateBookmark']>[0]);
          break;
        case 'remove_bookmark':
          result = this.handlers.removeBookmark(args as unknown as Parameters<MCPHandlers['removeBookmark']>[0]);
          break;
        case 'remove_group':
          result = this.handlers.removeGroup(args as unknown as Parameters<MCPHandlers['removeGroup']>[0]);
          break;
        case 'get_group':
          result = this.handlers.getGroup(args as unknown as Parameters<MCPHandlers['getGroup']>[0]);
          break;
        case 'get_bookmark':
          result = this.handlers.getBookmark(args as unknown as Parameters<MCPHandlers['getBookmark']>[0]);
          break;
        case 'get_bookmark_tree':
          result = this.handlers.getBookmarkTree(args as unknown as Parameters<MCPHandlers['getBookmarkTree']>[0]);
          break;
        case 'batch_add_bookmarks':
          result = this.handlers.batchAddBookmarks(args as unknown as Parameters<MCPHandlers['batchAddBookmarks']>[0]);
          break;
        case 'clear_all_bookmarks':
          result = this.handlers.clearAllBookmarks(args as unknown as Parameters<MCPHandlers['clearAllBookmarks']>[0]);
          break;
        default:
          result = { success: false, error: `Unknown tool: ${name}` };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ],
        isError: !result.success
      };
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AI Bookmarks MCP server started');
  }

  async stop(): Promise<void> {
    await this.server.close();
  }
}
