#!/usr/bin/env node

/**
 * Standalone MCP Server entry point for Claude Code integration.
 * This runs independently of the VSCode extension.
 */

import * as fs from 'fs';
import { BookmarkStoreManagerStandalone } from './store/bookmarkStoreStandalone';
import { MCPServerStandalone } from './mcp/serverStandalone';

// Get workspace root from environment or current directory
const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();

// Verify workspace exists
if (!fs.existsSync(workspaceRoot)) {
  console.error(`Workspace root does not exist: ${workspaceRoot}`);
  process.exit(1);
}

// Initialize store and server
const store = new BookmarkStoreManagerStandalone(workspaceRoot);
const server = new MCPServerStandalone(store);

// Start server
server.start().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await server.stop();
  store.dispose();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  store.dispose();
  process.exit(0);
});
