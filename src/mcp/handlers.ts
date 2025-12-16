import { BookmarkStoreManager } from '../store/bookmarkStore';
import {
  CreateGroupArgs,
  AddBookmarkArgs,
  ListGroupsArgs,
  ListBookmarksArgs,
  UpdateGroupArgs,
  UpdateBookmarkArgs,
  RemoveBookmarkArgs,
  RemoveGroupArgs,
  BookmarkCategory
} from '../store/types';

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export class MCPHandlers {
  constructor(private store: BookmarkStoreManager) {}

  // create_group - 创建一个新的书签分组
  createGroup(args: CreateGroupArgs): ToolResult {
    try {
      const { name, description, query } = args;

      if (!name || typeof name !== 'string') {
        return { success: false, error: 'name is required and must be a string' };
      }

      const groupId = this.store.createGroup(name, description, query, 'ai');

      return {
        success: true,
        data: {
          groupId,
          message: `Successfully created group "${name}"`
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create group: ${error}`
      };
    }
  }

  // add_bookmark - 在指定分组中添加书签
  addBookmark(args: AddBookmarkArgs): ToolResult {
    try {
      const { groupId, location, title, description, order, category, tags } = args;

      if (!groupId || typeof groupId !== 'string') {
        return { success: false, error: 'groupId is required and must be a string' };
      }
      if (!location || typeof location !== 'string') {
        return { success: false, error: 'location is required and must be a string' };
      }
      if (!title || typeof title !== 'string') {
        return { success: false, error: 'title is required and must be a string' };
      }
      if (!description || typeof description !== 'string') {
        return { success: false, error: 'description is required and must be a string' };
      }

      // Validate category if provided
      const validCategories: BookmarkCategory[] = [
        'entry-point', 'core-logic', 'todo', 'bug',
        'optimization', 'explanation', 'warning', 'reference'
      ];
      if (category && !validCategories.includes(category)) {
        return {
          success: false,
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
        };
      }

      const bookmarkId = this.store.addBookmark(groupId, location, title, description, {
        order,
        category,
        tags
      });

      if (!bookmarkId) {
        return { success: false, error: `Group with id "${groupId}" not found` };
      }

      return {
        success: true,
        data: {
          bookmarkId,
          message: `Successfully added bookmark "${title}" to group`
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to add bookmark: ${error}`
      };
    }
  }

  // list_groups - 列出所有书签分组
  listGroups(args: ListGroupsArgs): ToolResult {
    try {
      const { createdBy } = args;

      // Validate createdBy if provided
      if (createdBy && !['ai', 'user'].includes(createdBy)) {
        return {
          success: false,
          error: 'createdBy must be either "ai" or "user"'
        };
      }

      const groups = this.store.listGroups(createdBy as 'ai' | 'user' | undefined);

      return {
        success: true,
        data: {
          groups: groups.map(g => ({
            id: g.id,
            name: g.name,
            description: g.description,
            query: g.query,
            createdAt: g.createdAt,
            updatedAt: g.updatedAt,
            createdBy: g.createdBy,
            bookmarkCount: g.bookmarks.length
          })),
          total: groups.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list groups: ${error}`
      };
    }
  }

  // list_bookmarks - 列出书签, 支持筛选
  listBookmarks(args: ListBookmarksArgs): ToolResult {
    try {
      const { groupId, filePath, category, tags } = args;

      // Validate category if provided
      const validCategories: BookmarkCategory[] = [
        'entry-point', 'core-logic', 'todo', 'bug',
        'optimization', 'explanation', 'warning', 'reference'
      ];
      if (category && !validCategories.includes(category)) {
        return {
          success: false,
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
        };
      }

      const results = this.store.listBookmarks({
        groupId,
        filePath,
        category,
        tags
      });

      return {
        success: true,
        data: {
          bookmarks: results.map(r => ({
            id: r.bookmark.id,
            order: r.bookmark.order,
            location: r.bookmark.location,
            title: r.bookmark.title,
            description: r.bookmark.description,
            category: r.bookmark.category,
            tags: r.bookmark.tags,
            groupId: r.group.id,
            groupName: r.group.name
          })),
          total: results.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list bookmarks: ${error}`
      };
    }
  }

  // update_group - 更新分组信息
  updateGroup(args: UpdateGroupArgs): ToolResult {
    try {
      const { groupId, name, description } = args;

      if (!groupId || typeof groupId !== 'string') {
        return { success: false, error: 'groupId is required and must be a string' };
      }

      if (name === undefined && description === undefined) {
        return { success: false, error: 'At least one of name or description must be provided' };
      }

      const success = this.store.updateGroup(groupId, { name, description });

      if (!success) {
        return { success: false, error: `Group with id "${groupId}" not found` };
      }

      return {
        success: true,
        data: {
          message: `Successfully updated group "${groupId}"`
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update group: ${error}`
      };
    }
  }

  // update_bookmark - 更新书签内容
  updateBookmark(args: UpdateBookmarkArgs): ToolResult {
    try {
      const { bookmarkId, location, title, description, order, category, tags } = args;

      if (!bookmarkId || typeof bookmarkId !== 'string') {
        return { success: false, error: 'bookmarkId is required and must be a string' };
      }

      // Check if at least one update field is provided
      if (location === undefined && title === undefined && description === undefined &&
          order === undefined && category === undefined && tags === undefined) {
        return { success: false, error: 'At least one update field must be provided' };
      }

      // Validate category if provided
      const validCategories: BookmarkCategory[] = [
        'entry-point', 'core-logic', 'todo', 'bug',
        'optimization', 'explanation', 'warning', 'reference'
      ];
      if (category && !validCategories.includes(category)) {
        return {
          success: false,
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
        };
      }

      const success = this.store.updateBookmark(bookmarkId, {
        location,
        title,
        description,
        order,
        category,
        tags
      });

      if (!success) {
        return { success: false, error: `Bookmark with id "${bookmarkId}" not found` };
      }

      return {
        success: true,
        data: {
          message: `Successfully updated bookmark "${bookmarkId}"`
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update bookmark: ${error}`
      };
    }
  }

  // remove_bookmark - 删除书签
  removeBookmark(args: RemoveBookmarkArgs): ToolResult {
    try {
      const { bookmarkId } = args;

      if (!bookmarkId || typeof bookmarkId !== 'string') {
        return { success: false, error: 'bookmarkId is required and must be a string' };
      }

      const success = this.store.removeBookmark(bookmarkId);

      if (!success) {
        return { success: false, error: `Bookmark with id "${bookmarkId}" not found` };
      }

      return {
        success: true,
        data: {
          message: `Successfully removed bookmark "${bookmarkId}"`
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to remove bookmark: ${error}`
      };
    }
  }

  // remove_group - 删除整个分组(包含其中所有书签)
  removeGroup(args: RemoveGroupArgs): ToolResult {
    try {
      const { groupId } = args;

      if (!groupId || typeof groupId !== 'string') {
        return { success: false, error: 'groupId is required and must be a string' };
      }

      const group = this.store.getGroup(groupId);
      if (!group) {
        return { success: false, error: `Group with id "${groupId}" not found` };
      }

      const bookmarkCount = group.bookmarks.length;
      const success = this.store.removeGroup(groupId);

      if (!success) {
        return { success: false, error: `Failed to remove group "${groupId}"` };
      }

      return {
        success: true,
        data: {
          message: `Successfully removed group "${group.name}" with ${bookmarkCount} bookmark(s)`
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to remove group: ${error}`
      };
    }
  }
}
