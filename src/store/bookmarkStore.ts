import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  BookmarkStore,
  BookmarkGroup,
  Bookmark,
  BookmarkCategory,
  createDefaultStore
} from './types';
import { nowISO, parseLocation, normalizePath, formatLocation, adjustLineNumbers } from '../utils';

const STORE_FILE_NAME = 'ai-bookmarks.json';
const STORE_DIR = '.vscode';

export class BookmarkStoreManager {
  private store: BookmarkStore;
  private storePath: string;
  private workspaceRoot: string;
  private fileWatcher: vscode.FileSystemWatcher | undefined;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.storePath = path.join(workspaceRoot, STORE_DIR, STORE_FILE_NAME);
    this.store = this.load();
    this.setupFileWatcher();
  }

  private setupFileWatcher(): void {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(path.dirname(this.storePath), STORE_FILE_NAME)
    );

    this.fileWatcher.onDidChange(() => {
      this.reload();
    });

    this.fileWatcher.onDidCreate(() => {
      this.reload();
    });

    this.fileWatcher.onDidDelete(() => {
      this.store = createDefaultStore(path.basename(this.workspaceRoot));
      this._onDidChange.fire();
    });
  }

  private load(): BookmarkStore {
    try {
      if (fs.existsSync(this.storePath)) {
        const content = fs.readFileSync(this.storePath, 'utf-8');
        return JSON.parse(content) as BookmarkStore;
      }
    } catch (error) {
      console.error('Failed to load bookmark store:', error);
    }

    return createDefaultStore(path.basename(this.workspaceRoot));
  }

  private reload(): void {
    this.store = this.load();
    this._onDidChange.fire();
  }

  private save(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save bookmark store:', error);
      vscode.window.showErrorMessage(`Failed to save bookmarks: ${error}`);
    }
  }

  // Group operations

  createGroup(
    name: string,
    description?: string,
    query?: string,
    createdBy: 'ai' | 'user' = 'ai'
  ): string {
    const id = uuidv4();
    const now = nowISO();

    const group: BookmarkGroup = {
      id,
      name,
      description,
      query,
      createdAt: now,
      updatedAt: now,
      createdBy,
      bookmarks: []
    };

    this.store.groups.push(group);
    this.save();
    this._onDidChange.fire();

    return id;
  }

  getGroup(groupId: string): BookmarkGroup | undefined {
    return this.store.groups.find(g => g.id === groupId);
  }

  listGroups(createdBy?: 'ai' | 'user'): BookmarkGroup[] {
    if (createdBy) {
      return this.store.groups.filter(g => g.createdBy === createdBy);
    }
    return [...this.store.groups];
  }

  updateGroup(groupId: string, updates: { name?: string; description?: string }): boolean {
    const group = this.store.groups.find(g => g.id === groupId);
    if (!group) {
      return false;
    }

    if (updates.name !== undefined) {
      group.name = updates.name;
    }
    if (updates.description !== undefined) {
      group.description = updates.description;
    }
    group.updatedAt = nowISO();

    this.save();
    this._onDidChange.fire();

    return true;
  }

  removeGroup(groupId: string): boolean {
    const index = this.store.groups.findIndex(g => g.id === groupId);
    if (index === -1) {
      return false;
    }

    this.store.groups.splice(index, 1);
    this.save();
    this._onDidChange.fire();

    return true;
  }

  // Bookmark operations

  addBookmark(
    groupId: string,
    location: string,
    title: string,
    description: string,
    options: {
      order?: number;
      category?: BookmarkCategory;
      tags?: string[];
      codeSnapshot?: string;
    } = {}
  ): string | undefined {
    const group = this.store.groups.find(g => g.id === groupId);
    if (!group) {
      return undefined;
    }

    const id = uuidv4();

    // 确定 order
    let order = options.order;
    if (order === undefined) {
      order = group.bookmarks.length > 0
        ? Math.max(...group.bookmarks.map(b => b.order)) + 1
        : 1;
    }

    const bookmark: Bookmark = {
      id,
      order,
      location: normalizePath(location, this.workspaceRoot),
      title,
      description,
      category: options.category,
      tags: options.tags,
      codeSnapshot: options.codeSnapshot
    };

    group.bookmarks.push(bookmark);
    group.bookmarks.sort((a, b) => a.order - b.order);
    group.updatedAt = nowISO();

    this.save();
    this._onDidChange.fire();

    return id;
  }

  getBookmark(bookmarkId: string): { bookmark: Bookmark; group: BookmarkGroup } | undefined {
    for (const group of this.store.groups) {
      const bookmark = group.bookmarks.find(b => b.id === bookmarkId);
      if (bookmark) {
        return { bookmark, group };
      }
    }
    return undefined;
  }

  listBookmarks(filters: {
    groupId?: string;
    filePath?: string;
    category?: BookmarkCategory;
    tags?: string[];
  } = {}): Array<{ bookmark: Bookmark; group: BookmarkGroup }> {
    const results: Array<{ bookmark: Bookmark; group: BookmarkGroup }> = [];

    const groups = filters.groupId
      ? this.store.groups.filter(g => g.id === filters.groupId)
      : this.store.groups;

    for (const group of groups) {
      for (const bookmark of group.bookmarks) {
        // Apply filters
        if (filters.filePath) {
          const parsed = parseLocation(bookmark.location);
          const normalizedFilter = normalizePath(filters.filePath, this.workspaceRoot);
          if (!parsed.filePath.includes(normalizedFilter) &&
              !normalizedFilter.includes(parsed.filePath)) {
            continue;
          }
        }

        if (filters.category && bookmark.category !== filters.category) {
          continue;
        }

        if (filters.tags && filters.tags.length > 0) {
          if (!bookmark.tags || !filters.tags.some(t => bookmark.tags!.includes(t))) {
            continue;
          }
        }

        results.push({ bookmark, group });
      }
    }

    return results;
  }

  updateBookmark(
    bookmarkId: string,
    updates: {
      location?: string;
      title?: string;
      description?: string;
      order?: number;
      category?: BookmarkCategory;
      tags?: string[];
    }
  ): boolean {
    const result = this.getBookmark(bookmarkId);
    if (!result) {
      return false;
    }

    const { bookmark, group } = result;

    if (updates.location !== undefined) {
      bookmark.location = normalizePath(updates.location, this.workspaceRoot);
    }
    if (updates.title !== undefined) {
      bookmark.title = updates.title;
    }
    if (updates.description !== undefined) {
      bookmark.description = updates.description;
    }
    if (updates.order !== undefined) {
      bookmark.order = updates.order;
      group.bookmarks.sort((a, b) => a.order - b.order);
    }
    if (updates.category !== undefined) {
      bookmark.category = updates.category;
    }
    if (updates.tags !== undefined) {
      bookmark.tags = updates.tags;
    }

    group.updatedAt = nowISO();

    this.save();
    this._onDidChange.fire();

    return true;
  }

  removeBookmark(bookmarkId: string): boolean {
    for (const group of this.store.groups) {
      const index = group.bookmarks.findIndex(b => b.id === bookmarkId);
      if (index !== -1) {
        group.bookmarks.splice(index, 1);
        group.updatedAt = nowISO();

        this.save();
        this._onDidChange.fire();

        return true;
      }
    }
    return false;
  }

  // Get bookmarks by file
  getBookmarksByFile(filePath: string): Array<{ bookmark: Bookmark; group: BookmarkGroup }> {
    const normalizedPath = normalizePath(filePath, this.workspaceRoot);
    return this.listBookmarks({ filePath: normalizedPath });
  }

  // Get all bookmarks flat
  getAllBookmarks(): Array<{ bookmark: Bookmark; group: BookmarkGroup }> {
    return this.listBookmarks();
  }

  // Export to markdown
  exportToMarkdown(): string {
    const lines: string[] = [];
    lines.push(`# ${this.store.projectName} - AI Bookmarks`);
    lines.push('');

    for (const group of this.store.groups) {
      lines.push(`## ${group.name}`);
      if (group.description) {
        lines.push('');
        lines.push(group.description);
      }
      if (group.query) {
        lines.push('');
        lines.push(`> Query: ${group.query}`);
      }
      lines.push('');

      for (const bookmark of group.bookmarks) {
        lines.push(`### ${bookmark.order}. ${bookmark.title}`);
        lines.push('');
        lines.push(`**Location:** \`${bookmark.location}\``);
        if (bookmark.category) {
          lines.push(`**Category:** ${bookmark.category}`);
        }
        if (bookmark.tags && bookmark.tags.length > 0) {
          lines.push(`**Tags:** ${bookmark.tags.join(', ')}`);
        }
        lines.push('');
        lines.push(bookmark.description);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // Check if a bookmark's code has changed significantly
  async checkBookmarkValidity(
    bookmarkId: string,
    getFileContent: (filePath: string) => Promise<string | undefined>
  ): Promise<{ valid: boolean; reason?: string }> {
    const result = this.getBookmark(bookmarkId);
    if (!result) {
      return { valid: false, reason: 'Bookmark not found' };
    }

    const { bookmark } = result;

    // 如果没有 codeSnapshot, 无法检测
    if (!bookmark.codeSnapshot) {
      return { valid: true, reason: 'No snapshot to compare' };
    }

    try {
      const parsed = parseLocation(bookmark.location);
      const absolutePath = path.join(this.workspaceRoot, parsed.filePath);
      const content = await getFileContent(absolutePath);

      if (!content) {
        return { valid: false, reason: 'File not found' };
      }

      const lines = content.split('\n');
      const startIdx = parsed.startLine - 1;
      const endIdx = parsed.endLine;

      if (startIdx < 0 || endIdx > lines.length) {
        return { valid: false, reason: 'Line range out of bounds' };
      }

      const currentCode = lines.slice(startIdx, endIdx).join('\n');

      // 简单比较: 如果完全匹配则有效
      if (currentCode === bookmark.codeSnapshot) {
        return { valid: true };
      }

      // 计算相似度 (简单的字符级别比较)
      const similarity = this.calculateSimilarity(bookmark.codeSnapshot, currentCode);
      if (similarity < 0.5) {
        return { valid: false, reason: `Code changed significantly (${Math.round(similarity * 100)}% similar)` };
      }

      return { valid: true, reason: `Code slightly changed (${Math.round(similarity * 100)}% similar)` };
    } catch (error) {
      return { valid: false, reason: `Error checking validity: ${error}` };
    }
  }

  // Simple similarity calculation (Jaccard-like)
  private calculateSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.split(/\s+/));
    const set2 = new Set(str2.split(/\s+/));

    let intersection = 0;
    for (const word of set1) {
      if (set2.has(word)) {
        intersection++;
      }
    }

    const union = set1.size + set2.size - intersection;
    return union === 0 ? 1 : intersection / union;
  }

  // Update bookmark with code snapshot
  updateBookmarkSnapshot(bookmarkId: string, codeSnapshot: string): boolean {
    const result = this.getBookmark(bookmarkId);
    if (!result) {
      return false;
    }

    result.bookmark.codeSnapshot = codeSnapshot;
    result.group.updatedAt = nowISO();

    this.save();
    this._onDidChange.fire();

    return true;
  }

  // Adjust bookmarks when document changes (line drift handling)
  adjustBookmarksForFileChange(
    filePath: string,
    editStartLine: number,
    lineDelta: number
  ): void {
    const normalizedPath = normalizePath(filePath, this.workspaceRoot);
    let hasChanges = false;

    for (const group of this.store.groups) {
      for (const bookmark of group.bookmarks) {
        try {
          const parsed = parseLocation(bookmark.location);

          // 只处理同一文件的书签
          if (parsed.filePath !== normalizedPath) {
            continue;
          }

          // 调整行号
          const adjusted = adjustLineNumbers(parsed, editStartLine, lineDelta);

          // 如果行号有变化, 更新书签
          if (adjusted.startLine !== parsed.startLine || adjusted.endLine !== parsed.endLine) {
            bookmark.location = formatLocation(adjusted);
            hasChanges = true;
          }
        } catch (error) {
          // 忽略无法解析的书签
          console.error(`Failed to parse bookmark location: ${bookmark.location}`, error);
        }
      }

      if (hasChanges) {
        group.updatedAt = nowISO();
      }
    }

    if (hasChanges) {
      this.save();
      this._onDidChange.fire();
    }
  }

  // Cleanup
  dispose(): void {
    this.fileWatcher?.dispose();
    this._onDidChange.dispose();
  }
}
