import * as vscode from 'vscode';
import { BookmarkStoreManager } from '../store/bookmarkStore';
import { Bookmark, BookmarkCategory } from '../store/types';
import { parseLocation, normalizePath } from '../utils';

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  'entry-point': '#4CAF50',   // Green
  'core-logic': '#2196F3',    // Blue
  'todo': '#FF9800',          // Orange
  'bug': '#F44336',           // Red
  'optimization': '#9C27B0',  // Purple
  'explanation': '#607D8B',   // Gray
  'warning': '#FFC107',       // Amber
  'reference': '#00BCD4'      // Cyan
};

const DEFAULT_COLOR = '#888888';

export class DecorationProvider implements vscode.Disposable {
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor(
    private store: BookmarkStoreManager,
    private workspaceRoot: string
  ) {
    // Create decoration types for each category
    this.createDecorationTypes();

    // Listen for store changes
    this.disposables.push(
      store.onDidChange(() => {
        this.updateAllEditors();
      })
    );

    // Listen for active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this.updateDecorations(editor);
        }
      })
    );

    // Listen for visible editors changes
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(editors => {
        editors.forEach(editor => this.updateDecorations(editor));
      })
    );

    // Initial update
    this.updateAllEditors();
  }

  private createDecorationTypes(): void {
    // Create decoration type for each category
    for (const [category, color] of Object.entries(CATEGORY_COLORS)) {
      const decorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: this.createGutterIcon(color),
        gutterIconSize: 'contain',
        overviewRulerColor: color,
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        isWholeLine: false,
        backgroundColor: `${color}15`, // 15% opacity
        borderRadius: '3px'
      });
      this.decorationTypes.set(category, decorationType);
    }

    // Default decoration type
    const defaultDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGutterIcon(DEFAULT_COLOR),
      gutterIconSize: 'contain',
      overviewRulerColor: DEFAULT_COLOR,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      isWholeLine: false,
      backgroundColor: `${DEFAULT_COLOR}15`,
      borderRadius: '3px'
    });
    this.decorationTypes.set('default', defaultDecorationType);
  }

  private createGutterIcon(color: string): vscode.Uri {
    // Create a simple SVG icon for the gutter
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="${color}">
      <path d="M3 2v12l5-4 5 4V2z"/>
    </svg>`;

    const encodedSvg = encodeURIComponent(svg);
    return vscode.Uri.parse(`data:image/svg+xml,${encodedSvg}`);
  }

  private updateAllEditors(): void {
    vscode.window.visibleTextEditors.forEach(editor => {
      this.updateDecorations(editor);
    });
  }

  private updateDecorations(editor: vscode.TextEditor): void {
    // Check if decorations are enabled
    const config = vscode.workspace.getConfiguration('aiBookmarks');
    if (!config.get<boolean>('showInlineDecorations', true)) {
      this.clearDecorations(editor);
      return;
    }

    const filePath = normalizePath(editor.document.uri.fsPath, this.workspaceRoot);

    // Get bookmarks for this file
    const bookmarks = this.store.getBookmarksByFile(filePath);

    // Group bookmarks by category
    const bookmarksByCategory: Map<string, Array<{ bookmark: Bookmark; range: vscode.Range }>> = new Map();

    for (const { bookmark } of bookmarks) {
      try {
        const parsed = parseLocation(bookmark.location);

        // Create range (VSCode is 0-indexed, our format is 1-indexed)
        const startLine = Math.max(0, parsed.startLine - 1);
        const endLine = Math.max(0, parsed.endLine - 1);

        // 获取行末位置, 避免使用 MAX_SAFE_INTEGER
        const endLineLength = editor.document.lineAt(Math.min(endLine, editor.document.lineCount - 1)).text.length;
        const range = new vscode.Range(
          new vscode.Position(startLine, 0),
          new vscode.Position(endLine, endLineLength)
        );

        const category = bookmark.category || 'default';
        if (!bookmarksByCategory.has(category)) {
          bookmarksByCategory.set(category, []);
        }
        bookmarksByCategory.get(category)!.push({ bookmark, range });
      } catch (error) {
        console.error(`Failed to parse bookmark location: ${bookmark.location}`, error);
      }
    }

    // Clear all decorations first
    this.clearDecorations(editor);

    // Apply decorations by category
    for (const [category, items] of bookmarksByCategory) {
      const decorationType = this.decorationTypes.get(category) || this.decorationTypes.get('default')!;

      const decorations: vscode.DecorationOptions[] = items.map(({ bookmark, range }) => ({
        range,
        hoverMessage: this.createHoverMessage(bookmark)
      }));

      editor.setDecorations(decorationType, decorations);
    }
  }

  private clearDecorations(editor: vscode.TextEditor): void {
    for (const decorationType of this.decorationTypes.values()) {
      editor.setDecorations(decorationType, []);
    }
  }

  private createHoverMessage(bookmark: Bookmark): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`### ${bookmark.title}\n\n`);
    md.appendMarkdown(bookmark.description);

    if (bookmark.category) {
      md.appendMarkdown(`\n\n**Category:** ${bookmark.category}`);
    }

    if (bookmark.tags && bookmark.tags.length > 0) {
      md.appendMarkdown(`\n\n**Tags:** ${bookmark.tags.join(', ')}`);
    }

    return md;
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.decorationTypes.forEach(d => d.dispose());
    this.decorationTypes.clear();
  }
}
