import * as vscode from 'vscode';
import { BookmarkStoreManager } from '../store/bookmarkStore';
import { Bookmark, BookmarkGroup } from '../store/types';
import { parseLocation, normalizePath, getCategoryDisplayName } from '../utils';

export class BookmarkHoverProvider implements vscode.HoverProvider {
  constructor(
    private store: BookmarkStoreManager,
    private workspaceRoot: string
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const filePath = normalizePath(document.uri.fsPath, this.workspaceRoot);
    const line = position.line + 1; // Convert to 1-indexed

    // Get all bookmarks for this file
    const bookmarks = this.store.getBookmarksByFile(filePath);

    // Find bookmarks that include this line
    const matchingBookmarks: Array<{ bookmark: Bookmark; group: BookmarkGroup }> = [];

    for (const { bookmark, group } of bookmarks) {
      try {
        const parsed = parseLocation(bookmark.location);

        // Check if the cursor line is within the bookmark's range
        if (line >= parsed.startLine && line <= parsed.endLine) {
          matchingBookmarks.push({ bookmark, group });
        }
      } catch (error) {
        console.error(`Failed to parse bookmark location: ${bookmark.location}`, error);
      }
    }

    if (matchingBookmarks.length === 0) {
      return null;
    }

    // Create hover content
    const hoverContent = this.createHoverContent(matchingBookmarks);

    return new vscode.Hover(hoverContent);
  }

  private createHoverContent(
    bookmarks: Array<{ bookmark: Bookmark; group: BookmarkGroup }>
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    // Header
    md.appendMarkdown(`## AI Bookmarks\n\n`);

    for (let i = 0; i < bookmarks.length; i++) {
      const { bookmark, group } = bookmarks[i];

      if (i > 0) {
        md.appendMarkdown(`\n---\n\n`);
      }

      // Group info
      md.appendMarkdown(`**Group:** ${group.name}\n\n`);

      // Bookmark title with order
      md.appendMarkdown(`### ${bookmark.order}. ${bookmark.title}\n\n`);

      // Description
      md.appendMarkdown(bookmark.description);
      md.appendMarkdown('\n\n');

      // Metadata
      const metadata: string[] = [];

      if (bookmark.category) {
        metadata.push(`**Category:** ${getCategoryDisplayName(bookmark.category)}`);
      }

      if (bookmark.tags && bookmark.tags.length > 0) {
        const tags = bookmark.tags.map(t => `\`${t}\``).join(' ');
        metadata.push(`**Tags:** ${tags}`);
      }

      if (metadata.length > 0) {
        md.appendMarkdown(metadata.join(' | '));
      }
    }

    return md;
  }
}
