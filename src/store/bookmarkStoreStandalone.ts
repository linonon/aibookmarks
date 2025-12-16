import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  BookmarkStore,
  BookmarkGroup,
  Bookmark,
  BookmarkCategory,
  createDefaultStore
} from './types';
import { nowISO, parseLocation, normalizePath } from '../utils';

const STORE_FILE_NAME = 'ai-bookmarks.json';
const STORE_DIR = '.vscode';

/**
 * Standalone BookmarkStoreManager without VSCode dependencies.
 * Used by the MCP server running outside of VSCode.
 */
export class BookmarkStoreManagerStandalone extends EventEmitter {
  private store: BookmarkStore;
  private storePath: string;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    super();
    this.workspaceRoot = workspaceRoot;
    this.storePath = path.join(workspaceRoot, STORE_DIR, STORE_FILE_NAME);
    this.store = this.load();
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
    this.emit('change');
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
    this.emit('change');

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
    this.emit('change');

    return true;
  }

  removeGroup(groupId: string): boolean {
    const index = this.store.groups.findIndex(g => g.id === groupId);
    if (index === -1) {
      return false;
    }

    this.store.groups.splice(index, 1);
    this.save();
    this.emit('change');

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

    // Determine order
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
    this.emit('change');

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
    this.emit('change');

    return true;
  }

  removeBookmark(bookmarkId: string): boolean {
    for (const group of this.store.groups) {
      const index = group.bookmarks.findIndex(b => b.id === bookmarkId);
      if (index !== -1) {
        group.bookmarks.splice(index, 1);
        group.updatedAt = nowISO();

        this.save();
        this.emit('change');

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

  // Cleanup
  dispose(): void {
    this.removeAllListeners();
  }
}
