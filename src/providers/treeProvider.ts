import * as vscode from 'vscode';
import * as path from 'path';
import { BookmarkStoreManager } from '../store/bookmarkStore';
import { BookmarkGroup, Bookmark } from '../store/types';
import { parseLocation, getCategoryDisplayName, getCategoryIcon } from '../utils';

// Tree item types
type TreeItemType = 'group' | 'bookmark';

interface GroupTreeItem {
  type: 'group';
  group: BookmarkGroup;
}

interface BookmarkTreeItem {
  type: 'bookmark';
  bookmark: Bookmark;
  group: BookmarkGroup;
}

type BookmarkTreeData = GroupTreeItem | BookmarkTreeItem;

export class BookmarkTreeProvider implements vscode.TreeDataProvider<BookmarkTreeData> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BookmarkTreeData | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private store: BookmarkStoreManager,
    private extensionUri: vscode.Uri
  ) {
    // Listen for store changes
    store.onDidChange(() => {
      this.refresh();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BookmarkTreeData): vscode.TreeItem {
    if (element.type === 'group') {
      return this.createGroupTreeItem(element.group);
    } else {
      return this.createBookmarkTreeItem(element.bookmark, element.group);
    }
  }

  getChildren(element?: BookmarkTreeData): Thenable<BookmarkTreeData[]> {
    if (!element) {
      // Root level: return groups
      const groups = this.store.listGroups();
      return Promise.resolve(
        groups.map(group => ({ type: 'group' as const, group }))
      );
    }

    if (element.type === 'group') {
      // Group level: return bookmarks
      const bookmarks = element.group.bookmarks.map(bookmark => ({
        type: 'bookmark' as const,
        bookmark,
        group: element.group
      }));
      return Promise.resolve(bookmarks);
    }

    // Bookmark level: no children
    return Promise.resolve([]);
  }

  getParent(element: BookmarkTreeData): BookmarkTreeData | undefined {
    if (element.type === 'bookmark') {
      return { type: 'group', group: element.group };
    }
    return undefined;
  }

  private createGroupTreeItem(group: BookmarkGroup): vscode.TreeItem {
    const item = new vscode.TreeItem(
      group.name,
      group.bookmarks.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    );

    item.id = group.id;
    item.contextValue = 'group';
    item.description = `${group.bookmarks.length} bookmark(s)`;

    if (group.description) {
      item.tooltip = new vscode.MarkdownString();
      item.tooltip.appendMarkdown(`**${group.name}**\n\n`);
      item.tooltip.appendMarkdown(group.description);
      if (group.query) {
        item.tooltip.appendMarkdown(`\n\n---\n\n*Query: ${group.query}*`);
      }
    }

    // Icon based on creator
    item.iconPath = group.createdBy === 'ai'
      ? new vscode.ThemeIcon('sparkle')
      : new vscode.ThemeIcon('bookmark');

    return item;
  }

  private createBookmarkTreeItem(bookmark: Bookmark, group: BookmarkGroup): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `${bookmark.order}. ${bookmark.title}`,
      vscode.TreeItemCollapsibleState.None
    );

    item.id = bookmark.id;
    item.contextValue = 'bookmark';

    // Parse location for description
    try {
      const parsed = parseLocation(bookmark.location);
      const fileName = path.basename(parsed.filePath);
      const lineInfo = parsed.isRange
        ? `L${parsed.startLine}-${parsed.endLine}`
        : `L${parsed.startLine}`;
      item.description = `${fileName}:${lineInfo}`;
    } catch {
      item.description = bookmark.location;
    }

    // Tooltip with full information
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${bookmark.title}**\n\n`);
    tooltip.appendMarkdown(bookmark.description);
    tooltip.appendMarkdown(`\n\n---\n\n`);
    tooltip.appendMarkdown(`**Location:** \`${bookmark.location}\`\n\n`);
    if (bookmark.category) {
      tooltip.appendMarkdown(`**Category:** ${getCategoryDisplayName(bookmark.category)}\n\n`);
    }
    if (bookmark.tags && bookmark.tags.length > 0) {
      tooltip.appendMarkdown(`**Tags:** ${bookmark.tags.join(', ')}`);
    }
    item.tooltip = tooltip;

    // Icon based on category
    const iconName = getCategoryIcon(bookmark.category);
    item.iconPath = this.getIconPath(iconName);

    // Command to jump to location
    item.command = {
      command: 'aiBookmarks.jumpTo',
      title: 'Jump to Bookmark',
      arguments: [bookmark]
    };

    return item;
  }

  private getIconPath(iconName: string): vscode.Uri | vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
    // Use theme icons for all categories (more reliable than custom SVGs)
    const themeIconMap: Record<string, string> = {
      'bookmark': 'bookmark',
      'entry-point': 'debug-start',
      'core-logic': 'symbol-method',
      'todo': 'checklist',
      'bug': 'bug',
      'optimization': 'rocket',
      'explanation': 'info',
      'warning': 'warning',
      'reference': 'references'
    };

    const themeIcon = themeIconMap[iconName];
    if (themeIcon) {
      return new vscode.ThemeIcon(themeIcon);
    }

    // Fallback to custom icon if exists
    const lightIcon = vscode.Uri.joinPath(this.extensionUri, 'icons', `${iconName}.svg`);
    const darkIcon = vscode.Uri.joinPath(this.extensionUri, 'icons', `${iconName}.svg`);
    return { light: lightIcon, dark: darkIcon };
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
