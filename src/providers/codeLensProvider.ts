import * as vscode from 'vscode';
import { BookmarkStoreManager } from '../store/bookmarkStore';
import { parseLocation, normalizePath } from '../utils';

export class BookmarkCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(
    private store: BookmarkStoreManager,
    private workspaceRoot: string
  ) {
    // Refresh code lenses when bookmarks change
    store.onDidChange(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const filePath = normalizePath(document.uri.fsPath, this.workspaceRoot);
    const bookmarks = this.store.getBookmarksByFile(filePath);

    const codeLenses: vscode.CodeLens[] = [];

    for (const { bookmark, group } of bookmarks) {
      try {
        const parsed = parseLocation(bookmark.location);
        const line = Math.max(0, parsed.startLine - 1);

        // Create range at the start of the bookmark line
        const range = new vscode.Range(line, 0, line, 0);

        // Category icon
        const icon = getCategoryIcon(bookmark.category);

        // Create CodeLens with command
        const codeLens = new vscode.CodeLens(range, {
          title: `${icon} ${bookmark.title}`,
          tooltip: `[${group.name}] ${bookmark.description}`,
          command: 'aiBookmarks.revealBookmark',
          arguments: [bookmark, group]
        });

        codeLenses.push(codeLens);
      } catch {
        // Skip invalid locations
      }
    }

    return codeLenses;
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}

function getCategoryIcon(category?: string): string {
  switch (category) {
    case 'entry-point': return '\u25B6'; // Play symbol
    case 'core-logic': return '\u2699';  // Gear
    case 'todo': return '\u2610';        // Checkbox
    case 'bug': return '\u2717';         // X mark
    case 'optimization': return '\u26A1'; // Lightning
    case 'warning': return '\u26A0';     // Warning
    case 'explanation': return '\u2139'; // Info
    case 'reference': return '\u2197';   // Arrow
    default: return '\u2691';            // Flag
  }
}
