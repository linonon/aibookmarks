# AI Bookmarks

AI-powered code bookmarks for VSCode with MCP (Model Context Protocol) integration.

## Features

- **AI-Powered Bookmarking**: AI assistants (like Claude Code) can create organized bookmarks to explain code architecture
- **Grouped Bookmarks**: Bookmarks are organized into groups by topic or query
- **Category System**: 8 built-in categories (entry-point, core-logic, todo, bug, optimization, explanation, warning, reference)
- **Tree View**: Browse bookmarks in the explorer sidebar
- **Quick Navigation**: Jump to bookmarked locations with a single click
- **Inline Decorations**: See bookmark icons in the editor gutter
- **Hover Preview**: View bookmark descriptions on hover
- **Search & Filter**: Search bookmarks or filter by category/tags
- **Keyboard Shortcuts**: Quick access to common operations
- **Export to Markdown**: Export all bookmarks for documentation

## Installation

1. Clone this repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 in VSCode to launch the extension in debug mode

Or package and install:
```bash
npm run package
# Then install the generated .vsix file
```

## Usage

### For AI Assistants (MCP Integration)

Configure in your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "ai-bookmarks": {
      "command": "node",
      "args": ["path/to/dist/mcp-server.js"],
      "env": {
        "AI_BOOKMARKS_WORKSPACE": "/path/to/your/workspace"
      }
    }
  }
}
```

Available MCP Tools:
- `create_group` - Create a bookmark group
- `add_bookmark` - Add a bookmark to a group
- `batch_add_bookmarks` - Add multiple bookmarks at once
- `list_groups` - List all groups
- `list_bookmarks` - List bookmarks with filters
- `get_group` - Get group details with all bookmarks
- `get_bookmark` - Get single bookmark details
- `update_group` - Update group info
- `update_bookmark` - Update bookmark properties
- `remove_group` - Delete a group and its bookmarks
- `remove_bookmark` - Delete a single bookmark
- `clear_all_bookmarks` - Clear all data (requires confirmation)

### For Users

**Commands:**
- `AI Bookmarks: Refresh` - Refresh the bookmark tree
- `AI Bookmarks: Add Bookmark Here` - Manually add a bookmark at cursor
- `AI Bookmarks: Create Group` - Create a new bookmark group
- `AI Bookmarks: Edit Group` - Edit group name and description
- `AI Bookmarks: Rename Group` - Quick rename a group (F2)
- `AI Bookmarks: Delete Group` - Delete a group and its bookmarks
- `AI Bookmarks: Edit Bookmark` - Edit bookmark properties
- `AI Bookmarks: Delete Bookmark` - Delete a bookmark
- `AI Bookmarks: Move to Group...` - Move bookmark to another group
- `AI Bookmarks: Move Bookmark Up/Down` - Reorder bookmarks within group
- `AI Bookmarks: Search Bookmarks` - Search through all bookmarks
- `AI Bookmarks: Export as Markdown` - Export bookmarks to markdown
- `AI Bookmarks: Toggle View Mode` - Switch between group/file view
- `AI Bookmarks: Expand All` - Expand all tree nodes
- `AI Bookmarks: Collapse All` - Collapse all tree nodes

**Keyboard Shortcuts:**
- `Ctrl+Alt+B` / `Cmd+Alt+B` - Add bookmark at cursor
- `Ctrl+Shift+B` / `Cmd+Shift+B` - Search bookmarks
- `Ctrl+Alt+Down` / `Cmd+Alt+Down` - Go to next bookmark
- `Ctrl+Alt+Up` / `Cmd+Alt+Up` - Go to previous bookmark
- `F2` - Rename selected group (in tree view)
- `Delete` / `Cmd+Backspace` - Delete selected bookmark (in tree view)

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `aiBookmarks.mcpPort` | 3333 | MCP Server port |
| `aiBookmarks.showInlineDecorations` | true | Show bookmark icons in gutter |
| `aiBookmarks.viewMode` | "group" | View mode: "group" or "file" |
| `aiBookmarks.quickAddMode` | "simple" | Quick add mode: "full" (all options) or "simple" (title only) |
| `aiBookmarks.defaultCategory` | "explanation" | Default category for new bookmarks |
| `aiBookmarks.confirmBeforeDelete` | true | Show confirmation before deleting |

## Data Storage

Bookmarks are stored in `.vscode/ai-bookmarks.json` within your workspace. This file can be committed to version control to share bookmarks with your team.

## Development

```bash
# Install dependencies
npm install

# Watch mode (auto-recompile)
npm run watch

# Compile once
npm run compile

# Package extension
npm run package

# Lint
npm run lint
```

## License

MIT
