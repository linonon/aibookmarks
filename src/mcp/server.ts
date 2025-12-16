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
