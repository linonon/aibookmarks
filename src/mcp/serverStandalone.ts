import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { BookmarkStoreManagerStandalone } from '../store/bookmarkStoreStandalone';
import { MCPHandlersStandalone } from './handlersStandalone';

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
    description: 'Add a bookmark to a group. Bookmarks mark important code locations with explanations.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'The ID of the group to add the bookmark to'
        },
        location: {
          type: 'string',
          description: 'Location in format "path/to/file:line" or "path/to/file:start-end" for ranges'
        },
        title: {
          type: 'string',
          description: 'Short title for the bookmark'
        },
        description: {
          type: 'string',
          description: 'Detailed description explaining the code at this location'
        },
        order: {
          type: 'number',
          description: 'Order within the group (optional, appends to end if not specified)'
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
    description: 'List bookmarks with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'Filter by group ID'
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
    description: 'Update a bookmark\'s properties.',
    inputSchema: {
      type: 'object',
      properties: {
        bookmarkId: {
          type: 'string',
          description: 'The ID of the bookmark to update'
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
          description: 'New order within group'
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
    description: 'Remove a bookmark by its ID.',
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
    description: 'Get a single bookmark group with all its bookmarks.',
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
    description: 'Get a single bookmark by its ID with its group info.',
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
    name: 'batch_add_bookmarks',
    description: 'Add multiple bookmarks to a group in a single operation. More efficient than adding one by one.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'The ID of the group to add bookmarks to'
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
                description: 'Short title for the bookmark'
              },
              description: {
                type: 'string',
                description: 'Detailed description'
              },
              order: {
                type: 'number',
                description: 'Order within the group (optional)'
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

export class MCPServerStandalone {
  private server: Server;
  private handlers: MCPHandlersStandalone;

  constructor(store: BookmarkStoreManagerStandalone) {
    this.handlers = new MCPHandlersStandalone(store);
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
          result = this.handlers.createGroup(args as unknown as Parameters<MCPHandlersStandalone['createGroup']>[0]);
          break;
        case 'add_bookmark':
          result = this.handlers.addBookmark(args as unknown as Parameters<MCPHandlersStandalone['addBookmark']>[0]);
          break;
        case 'list_groups':
          result = this.handlers.listGroups(args as unknown as Parameters<MCPHandlersStandalone['listGroups']>[0]);
          break;
        case 'list_bookmarks':
          result = this.handlers.listBookmarks(args as unknown as Parameters<MCPHandlersStandalone['listBookmarks']>[0]);
          break;
        case 'update_group':
          result = this.handlers.updateGroup(args as unknown as Parameters<MCPHandlersStandalone['updateGroup']>[0]);
          break;
        case 'update_bookmark':
          result = this.handlers.updateBookmark(args as unknown as Parameters<MCPHandlersStandalone['updateBookmark']>[0]);
          break;
        case 'remove_bookmark':
          result = this.handlers.removeBookmark(args as unknown as Parameters<MCPHandlersStandalone['removeBookmark']>[0]);
          break;
        case 'remove_group':
          result = this.handlers.removeGroup(args as unknown as Parameters<MCPHandlersStandalone['removeGroup']>[0]);
          break;
        case 'get_group':
          result = this.handlers.getGroup(args as unknown as Parameters<MCPHandlersStandalone['getGroup']>[0]);
          break;
        case 'get_bookmark':
          result = this.handlers.getBookmark(args as unknown as Parameters<MCPHandlersStandalone['getBookmark']>[0]);
          break;
        case 'batch_add_bookmarks':
          result = this.handlers.batchAddBookmarks(args as unknown as Parameters<MCPHandlersStandalone['batchAddBookmarks']>[0]);
          break;
        case 'clear_all_bookmarks':
          result = this.handlers.clearAllBookmarks(args as unknown as Parameters<MCPHandlersStandalone['clearAllBookmarks']>[0]);
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
