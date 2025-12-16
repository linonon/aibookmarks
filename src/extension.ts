import * as vscode from 'vscode';
import * as path from 'path';
import { BookmarkStoreManager } from './store/bookmarkStore';
import { BookmarkTreeProvider } from './providers/treeProvider';
import { DecorationProvider } from './providers/decorationProvider';
import { BookmarkHoverProvider } from './providers/hoverProvider';
import { Bookmark } from './store/types';
import { parseLocation, toAbsolutePath } from './utils';

let bookmarkStore: BookmarkStoreManager | undefined;
let treeProvider: BookmarkTreeProvider | undefined;
let decorationProvider: DecorationProvider | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log('AI Bookmarks extension is activating...');

  // Get workspace root
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.log('No workspace folder found, AI Bookmarks will not activate');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Initialize bookmark store
  bookmarkStore = new BookmarkStoreManager(workspaceRoot);

  // Initialize tree provider
  treeProvider = new BookmarkTreeProvider(bookmarkStore, context.extensionUri);

  // Register tree view
  const treeView = vscode.window.createTreeView('aiBookmarks', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });

  // Initialize decoration provider
  decorationProvider = new DecorationProvider(bookmarkStore, workspaceRoot);

  // Initialize hover provider
  const hoverProvider = new BookmarkHoverProvider(bookmarkStore, workspaceRoot);

  // Register hover provider for all languages
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider)
  );

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'aiBookmarks.search';
  updateStatusBar();

  // Update status bar when bookmarks change
  bookmarkStore.onDidChange(() => {
    updateStatusBar();
  });

  // Listen for document changes to handle line drift
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!bookmarkStore) {
        return;
      }

      const document = event.document;
      // 只处理文件 scheme
      if (document.uri.scheme !== 'file') {
        return;
      }

      // 计算行号变化
      for (const change of event.contentChanges) {
        const startLine = change.range.start.line + 1; // 转为 1-indexed
        const oldLineCount = change.range.end.line - change.range.start.line + 1;
        const newLineCount = change.text.split('\n').length;
        const lineDelta = newLineCount - oldLineCount;

        if (lineDelta !== 0) {
          bookmarkStore.adjustBookmarksForFileChange(
            document.uri.fsPath,
            startLine,
            lineDelta
          );
        }
      }
    })
  );

  // Register commands
  registerCommands(context, workspaceRoot);

  // Add to subscriptions
  context.subscriptions.push(treeView);
  context.subscriptions.push(statusBarItem);
  context.subscriptions.push({
    dispose: () => {
      bookmarkStore?.dispose();
      treeProvider?.dispose();
      decorationProvider?.dispose();
    }
  });

  console.log('AI Bookmarks extension activated');
}

function updateStatusBar(): void {
  if (!statusBarItem || !bookmarkStore) {
    return;
  }

  const allBookmarks = bookmarkStore.getAllBookmarks();
  const groupCount = bookmarkStore.listGroups().length;

  if (allBookmarks.length > 0) {
    statusBarItem.text = `$(bookmark) ${allBookmarks.length}`;
    statusBarItem.tooltip = `AI Bookmarks: ${allBookmarks.length} bookmark(s) in ${groupCount} group(s)\nClick to search`;
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

function registerCommands(context: vscode.ExtensionContext, workspaceRoot: string): void {
  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('aiBookmarks.refresh', () => {
      treeProvider?.refresh();
    })
  );

  // Jump to bookmark command
  context.subscriptions.push(
    vscode.commands.registerCommand('aiBookmarks.jumpTo', async (bookmark: Bookmark) => {
      if (!bookmark) {
        return;
      }

      try {
        const parsed = parseLocation(bookmark.location);
        const absolutePath = toAbsolutePath(parsed.filePath, workspaceRoot);
        const uri = vscode.Uri.file(absolutePath);

        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        // Go to the start line (0-indexed)
        const startLine = Math.max(0, parsed.startLine - 1);
        const endLine = Math.max(0, parsed.endLine - 1);

        const range = new vscode.Range(
          new vscode.Position(startLine, 0),
          new vscode.Position(endLine, 0)
        );

        editor.selection = new vscode.Selection(range.start, range.start);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

        // Highlight the range briefly
        const decoration = vscode.window.createTextEditorDecorationType({
          backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
          isWholeLine: true
        });

        editor.setDecorations(decoration, [range]);

        // Remove highlight after 2 seconds
        setTimeout(() => {
          decoration.dispose();
        }, 2000);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to jump to bookmark: ${error}`);
      }
    })
  );

  // Delete bookmark command
  context.subscriptions.push(
    vscode.commands.registerCommand('aiBookmarks.delete', async (item: unknown) => {
      if (!bookmarkStore) {
        return;
      }

      // Extract bookmark from tree item
      const bookmarkItem = item as { type: string; bookmark?: Bookmark };
      if (bookmarkItem?.type !== 'bookmark' || !bookmarkItem.bookmark) {
        return;
      }

      const bookmark = bookmarkItem.bookmark;
      const confirm = await vscode.window.showWarningMessage(
        `Delete bookmark "${bookmark.title}"?`,
        { modal: true },
        'Delete'
      );

      if (confirm === 'Delete') {
        bookmarkStore.removeBookmark(bookmark.id);
        vscode.window.showInformationMessage(`Bookmark "${bookmark.title}" deleted`);
      }
    })
  );

  // Delete group command
  context.subscriptions.push(
    vscode.commands.registerCommand('aiBookmarks.deleteGroup', async (item: unknown) => {
      if (!bookmarkStore) {
        return;
      }

      // Extract group from tree item
      const groupItem = item as { type: string; group?: { id: string; name: string; bookmarks: unknown[] } };
      if (groupItem?.type !== 'group' || !groupItem.group) {
        return;
      }

      const group = groupItem.group;
      const confirm = await vscode.window.showWarningMessage(
        `Delete group "${group.name}" and all ${group.bookmarks.length} bookmark(s)?`,
        { modal: true },
        'Delete'
      );

      if (confirm === 'Delete') {
        bookmarkStore.removeGroup(group.id);
        vscode.window.showInformationMessage(`Group "${group.name}" deleted`);
      }
    })
  );

  // Add manual bookmark command
  context.subscriptions.push(
    vscode.commands.registerCommand('aiBookmarks.addManual', async () => {
      if (!bookmarkStore) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      // Get current selection or cursor position
      const selection = editor.selection;
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;

      // Get file path relative to workspace
      const relativePath = path.relative(workspaceRoot, editor.document.uri.fsPath);
      const location = startLine === endLine
        ? `${relativePath}:${startLine}`
        : `${relativePath}:${startLine}-${endLine}`;

      // Get or create group
      const groups = bookmarkStore.listGroups();
      const groupItems: vscode.QuickPickItem[] = [
        { label: '$(add) Create New Group', description: 'Create a new bookmark group' },
        ...groups.map(g => ({
          label: g.name,
          description: `${g.bookmarks.length} bookmark(s)`,
          detail: g.id
        }))
      ];

      const selectedGroup = await vscode.window.showQuickPick(groupItems, {
        placeHolder: 'Select a group or create a new one'
      });

      if (!selectedGroup) {
        return;
      }

      let groupId: string;

      if (selectedGroup.label === '$(add) Create New Group') {
        const groupName = await vscode.window.showInputBox({
          prompt: 'Enter group name',
          placeHolder: 'e.g., Bug fixes, Feature implementation'
        });

        if (!groupName) {
          return;
        }

        groupId = bookmarkStore.createGroup(groupName, undefined, undefined, 'user');
      } else {
        groupId = selectedGroup.detail!;
      }

      // Get bookmark title
      const title = await vscode.window.showInputBox({
        prompt: 'Enter bookmark title',
        placeHolder: 'e.g., Main entry point'
      });

      if (!title) {
        return;
      }

      // Get bookmark description
      const description = await vscode.window.showInputBox({
        prompt: 'Enter bookmark description',
        placeHolder: 'Describe what this code does...'
      });

      if (!description) {
        return;
      }

      // Get category
      const categories = [
        { label: 'entry-point', description: 'Entry point to a feature or module' },
        { label: 'core-logic', description: 'Core business logic' },
        { label: 'todo', description: 'Something to be done' },
        { label: 'bug', description: 'Known bug or issue' },
        { label: 'optimization', description: 'Can be optimized' },
        { label: 'explanation', description: 'Just an explanation' },
        { label: 'warning', description: 'Important warning' },
        { label: 'reference', description: 'Reference material' }
      ];

      const selectedCategory = await vscode.window.showQuickPick(categories, {
        placeHolder: 'Select a category (optional)'
      });

      // Add bookmark
      bookmarkStore.addBookmark(groupId, location, title, description, {
        category: selectedCategory?.label as import('./store/types').BookmarkCategory | undefined
      });

      vscode.window.showInformationMessage(`Bookmark "${title}" added`);
    })
  );

  // Create group command
  context.subscriptions.push(
    vscode.commands.registerCommand('aiBookmarks.createGroup', async () => {
      if (!bookmarkStore) {
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: 'Enter group name',
        placeHolder: 'e.g., Authentication flow'
      });

      if (!name) {
        return;
      }

      const description = await vscode.window.showInputBox({
        prompt: 'Enter group description (optional)',
        placeHolder: 'Describe the purpose of this group...'
      });

      bookmarkStore.createGroup(name, description || undefined, undefined, 'user');
      vscode.window.showInformationMessage(`Group "${name}" created`);
    })
  );

  // Export to markdown command
  context.subscriptions.push(
    vscode.commands.registerCommand('aiBookmarks.exportMarkdown', async () => {
      if (!bookmarkStore) {
        return;
      }

      const markdown = bookmarkStore.exportToMarkdown();

      // Create a new untitled document with the markdown content
      const document = await vscode.workspace.openTextDocument({
        content: markdown,
        language: 'markdown'
      });

      await vscode.window.showTextDocument(document);

      vscode.window.showInformationMessage('Bookmarks exported to markdown');
    })
  );

  // Search bookmarks command
  context.subscriptions.push(
    vscode.commands.registerCommand('aiBookmarks.search', async () => {
      if (!bookmarkStore) {
        return;
      }

      const allBookmarks = bookmarkStore.getAllBookmarks();
      if (allBookmarks.length === 0) {
        vscode.window.showInformationMessage('No bookmarks to search');
        return;
      }

      // Create quick pick items
      const items: Array<vscode.QuickPickItem & { bookmark: Bookmark }> = allBookmarks.map(
        ({ bookmark, group }) => ({
          label: `${bookmark.order}. ${bookmark.title}`,
          description: bookmark.location,
          detail: `[${group.name}] ${bookmark.description.substring(0, 100)}${bookmark.description.length > 100 ? '...' : ''}`,
          bookmark
        })
      );

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Search bookmarks by title, location, or description',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (selected) {
        // Jump to the selected bookmark
        vscode.commands.executeCommand('aiBookmarks.jumpTo', selected.bookmark);
      }
    })
  );
}

export function deactivate(): void {
  bookmarkStore?.dispose();
  treeProvider?.dispose();
  decorationProvider?.dispose();
}
