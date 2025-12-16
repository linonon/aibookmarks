// Bookmark category types
export type BookmarkCategory =
  | 'entry-point'    // 入口点
  | 'core-logic'     // 核心逻辑
  | 'todo'           // 待办
  | 'bug'            // 已知问题
  | 'optimization'   // 可优化
  | 'explanation'    // 纯解释
  | 'warning'        // 注意事项
  | 'reference';     // 参考资料

// Single bookmark
export interface Bookmark {
  id: string;                    // UUID
  order: number;                 // 在分组内的顺序 (1, 2, 3...)
  location: string;              // 位置，格式: path/to/file:line 或 path/to/file:start-end

  // AI 生成的内容
  title: string;                 // 简短标题
  description: string;           // 详细说明
  category?: BookmarkCategory;   // 分类
  tags?: string[];               // 标签

  // 漂移检测(可选)
  codeSnapshot?: string;         // 创建时的代码快照
}

// Bookmark group
export interface BookmarkGroup {
  id: string;                    // UUID
  name: string;                  // 分组名称，如 "Crash 游戏核心流程"
  description?: string;          // 分组说明
  query?: string;                // 触发这个分组的用户问题(AI 生成时记录)
  createdAt: string;             // ISO timestamp
  updatedAt: string;
  createdBy: 'ai' | 'user';
  bookmarks: Bookmark[];         // 有序的书签列表
}

// Complete store structure
export interface BookmarkStore {
  version: number;
  projectName: string;
  groups: BookmarkGroup[];       // 所有分组
}

// Parsed location
export interface ParsedLocation {
  filePath: string;
  startLine: number;
  endLine: number;
  isRange: boolean;
}

// MCP tool arguments
export interface CreateGroupArgs {
  name: string;
  description?: string;
  query?: string;
}

export interface AddBookmarkArgs {
  groupId: string;
  location: string;
  title: string;
  description: string;
  order?: number;
  category?: BookmarkCategory;
  tags?: string[];
}

export interface ListGroupsArgs {
  createdBy?: 'ai' | 'user';
}

export interface ListBookmarksArgs {
  groupId?: string;
  filePath?: string;
  category?: BookmarkCategory;
  tags?: string[];
}

export interface UpdateGroupArgs {
  groupId: string;
  name?: string;
  description?: string;
}

export interface UpdateBookmarkArgs {
  bookmarkId: string;
  location?: string;
  title?: string;
  description?: string;
  order?: number;
  category?: BookmarkCategory;
  tags?: string[];
}

export interface RemoveBookmarkArgs {
  bookmarkId: string;
}

export interface RemoveGroupArgs {
  groupId: string;
}

// Default store factory
export function createDefaultStore(projectName: string): BookmarkStore {
  return {
    version: 1,
    projectName,
    groups: []
  };
}
