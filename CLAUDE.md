# AI Bookmarks - VSCode Extension

## 項目概述

這是一個 VSCode 擴展，提供「AI 書籤」功能。AI（通過 Claude Code）可以在代碼中標記重要位置，並寫入詳細說明，幫助理解和導航代碼庫。

## 核心功能

1. **AI 可調用的書籤工具** - 通過 MCP 協議暴露書籤操作
2. **手動書籤管理** - 用戶可直接在 VSCode 中創建、編輯、刪除書籤
3. **書籤側邊欄** - 在 VSCode 中顯示所有書籤，按文件分組
4. **行內標記** - 在編輯器 gutter 區域顯示書籤圖標
5. **懸浮預覽** - hover 時顯示書籤說明

## 技術架構

```
┌─────────────────────────────────────────────────────────┐
│                      VSCode                              │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │  擴展 UI         │◄───│  MCP Server (內嵌)          │ │
│  │  - TreeView     │    │  - add_bookmark             │ │
│  │  - Decorations  │    │  - list_bookmarks           │ │
│  │  - HoverProvider│    │  - remove_bookmark          │ │
│  └─────────────────┘    │  - update_bookmark          │ │
│                          └──────────▲──────────────────┘ │
└─────────────────────────────────────│────────────────────┘
                                      │ MCP (stdio)
                              ┌───────┴───────┐
                              │  Claude Code   │
                              └───────────────┘
```

## 項目結構

```
ai-bookmarks/
├── package.json              # VSCode 擴展配置
├── tsconfig.json
├── src/
│   ├── extension.ts          # 擴展入口
│   ├── mcp/
│   │   ├── server.ts         # MCP Server 實現
│   │   └── handlers.ts       # 工具處理函數
│   ├── providers/
│   │   ├── treeProvider.ts   # 書籤樹視圖
│   │   ├── decorationProvider.ts  # 行內裝飾
│   │   └── hoverProvider.ts  # 懸浮提示
│   ├── store/
│   │   ├── bookmarkStore.ts  # 書籤存儲管理
│   │   └── types.ts          # 類型定義
│   └── utils/
│       └── index.ts
├── icons/                    # 書籤圖標
│   ├── bookmark.svg
│   ├── entry-point.svg
│   ├── core-logic.svg
│   ├── todo.svg
│   ├── bug.svg
│   └── warning.svg
└── test/
```

## 數據結構

### Location 格式

書籤位置使用統一的字符串格式：

```
單行:   path/to/file:45
範圍:   path/to/file:78-92
```

解析邏輯：找最後一個 `:` 分割，檢查後面有沒有 `-` 判斷是單行還是範圍。

### BookmarkGroup

書籤按分組管理，每個分組通常對應一次 AI 問答或一個主題：

```typescript
interface BookmarkGroup {
  id: string;                    // UUID
  name: string;                  // 分組名稱，如 "Crash 遊戲核心流程"
  description?: string;          // 分組說明
  query?: string;                // 觸發這個分組的用戶問題（AI 生成時記錄）
  createdAt: string;             // ISO timestamp
  updatedAt: string;
  createdBy: 'ai' | 'user';
  bookmarks: Bookmark[];         // 有序的書籤列表
}
```

### Bookmark

```typescript
interface Bookmark {
  id: string;                    // UUID
  order: number;                 // 在分組內的順序 (1, 2, 3...)
  location: string;              // 位置，格式: path/to/file:line 或 path/to/file:start-end
  
  // AI 生成的內容
  title: string;                 // 簡短標題
  description: string;           // 詳細說明
  category?: BookmarkCategory;   // 分類
  tags?: string[];               // 標籤
  
  // 漂移檢測（可選）
  codeSnapshot?: string;         // 創建時的代碼快照
}

type BookmarkCategory = 
  | 'entry-point'      // 入口點
  | 'core-logic'       // 核心邏輯
  | 'todo'             // 待辦
  | 'bug'              // 已知問題
  | 'optimization'     // 可優化
  | 'explanation'      // 純解釋
  | 'warning'          // 注意事項
  | 'reference';       // 參考資料
```

### BookmarkStore

```typescript
interface BookmarkStore {
  version: number;
  projectName: string;
  groups: BookmarkGroup[];       // 所有分組
}
```

存儲位置：`.vscode/ai-bookmarks.json`

## MCP 工具定義

### create_group

創建一個新的書籤分組。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| name | string | ✓ | 分組名稱 |
| description | string | | 分組說明 |
| query | string | | 觸發這個分組的用戶問題 |

**返回：** 新創建的 group id

### add_bookmark

在指定分組中添加書籤。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| groupId | string | ✓ | 分組 ID |
| location | string | ✓ | 位置，格式: `path/to/file:line` 或 `path/to/file:start-end` |
| title | string | ✓ | 書籤標題 |
| description | string | ✓ | 詳細說明 |
| order | number | | 順序，不填則追加到末尾 |
| category | string | | 分類 |
| tags | string[] | | 標籤列表 |

### list_groups

列出所有書籤分組。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| createdBy | string | | 篩選 'ai' 或 'user' 創建的分組 |

### list_bookmarks

列出書籤，支持篩選。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| groupId | string | | 篩選特定分組 |
| filePath | string | | 篩選特定文件 |
| category | string | | 篩選特定分類 |
| tags | string[] | | 篩選特定標籤 |

### update_group

更新分組信息。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| groupId | string | ✓ | 分組 ID |
| name | string | | 新名稱 |
| description | string | | 新說明 |

### update_bookmark

更新書籤內容。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| bookmarkId | string | ✓ | 書籤 ID |
| location | string | | 新位置 |
| title | string | | 新標題 |
| description | string | | 新說明 |
| order | number | | 新順序 |
| category | string | | 新分類 |
| tags | string[] | | 新標籤 |

### remove_bookmark

刪除書籤。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| bookmarkId | string | ✓ | 書籤 ID |

### remove_group

刪除整個分組（包含其中所有書籤）。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| groupId | string | ✓ | 分組 ID |

### get_group

獲取單個分組的詳細信息（包含所有書籤）。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| groupId | string | ✓ | 分組 ID |

**返回：** 分組詳情及其所有書籤

### get_bookmark

獲取單個書籤的詳細信息。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| bookmarkId | string | ✓ | 書籤 ID |

**返回：** 書籤詳情及其所屬分組信息

### batch_add_bookmarks

批量添加書籤到分組，比單個添加更高效。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| groupId | string | ✓ | 分組 ID |
| bookmarks | array | ✓ | 書籤數組，每個元素包含 location, title, description 等字段 |

**bookmarks 數組元素：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| location | string | ✓ | 位置 |
| title | string | ✓ | 標題 |
| description | string | ✓ | 說明 |
| order | number | | 順序 |
| category | string | | 分類 |
| tags | string[] | | 標籤 |

**返回：** 添加結果摘要及每個書籤的狀態

### clear_all_bookmarks

清除所有書籤和分組。這是破壞性操作，需要顯式確認。

**參數：**
| 名稱 | 類型 | 必填 | 說明 |
|------|------|------|------|
| confirm | boolean | ✓ | 必須設置為 true 才能執行，防止誤操作 |

**返回：** 清除結果，包含刪除的分組數和書籤數

## 手動配置功能 (Manual Configuration)

除了 AI 通過 MCP 創建書籤外，用戶也可以完全手動管理書籤，不依賴 AI。

### 功能需求

#### 1. 分組管理

| 操作 | 觸發方式 | 說明 |
|------|----------|------|
| 創建分組 | 側邊欄工具欄按鈕 / 命令面板 | 彈出輸入框，輸入名稱和說明 |
| 編輯分組 | 右鍵菜單 / 雙擊分組名 | 修改分組名稱和說明 |
| 刪除分組 | 右鍵菜單 | 確認後刪除分組及其所有書籤 |
| 重命名分組 | 右鍵菜單 / F2 | 快速重命名 |

#### 2. 書籤管理

| 操作 | 觸發方式 | 說明 |
|------|----------|------|
| 添加書籤 | 編輯器右鍵 / 快捷鍵 `Ctrl+Alt+B` | 在當前光標位置創建書籤 |
| 編輯書籤 | 側邊欄右鍵 / 雙擊 | 修改標題、說明、分類、標籤 |
| 刪除書籤 | 側邊欄右鍵 / Delete 鍵 | 刪除單個書籤 |
| 移動書籤 | 拖拽 / 右鍵菜單 | 移動到其他分組 |
| 調整順序 | 拖拽 / 上下箭頭 | 調整書籤在分組內的順序 |

#### 3. 快速添加書籤流程

用戶在編輯器中右鍵選擇 "Add Bookmark Here" 或按快捷鍵後：

```
1. 彈出 QuickPick: 選擇目標分組（或創建新分組）
2. 彈出 InputBox: 輸入書籤標題
3. 彈出 InputBox: 輸入書籤說明（可選，支持多行）
4. 彈出 QuickPick: 選擇分類（可選）
5. 完成創建
```

簡化模式（設置項控制）：
```
1. 彈出 QuickPick: 選擇目標分組
2. 彈出 InputBox: 輸入標題
3. 完成（說明和分類使用默認值）
```

#### 4. 編輯書籤對話框

雙擊書籤或選擇 "Edit" 時，打開編輯界面：

**方案 A: 多步 InputBox（簡單實現）**
```
Step 1: 編輯標題
Step 2: 編輯說明
Step 3: 選擇分類
Step 4: 編輯標籤（逗號分隔）
```

**方案 B: Webview 表單（更好體驗，後期實現）**
- 單個對話框顯示所有字段
- 支持 Markdown 預覽
- 標籤自動補全

#### 5. 批量操作

| 操作 | 說明 |
|------|------|
| 批量刪除 | 多選書籤後刪除 |
| 批量移動 | 多選書籤移動到指定分組 |
| 批量設置分類 | 多選書籤統一設置分類 |

### VSCode 命令

```typescript
// 分組操作
"aiBookmarks.createGroup"       // 創建分組
"aiBookmarks.editGroup"         // 編輯分組
"aiBookmarks.deleteGroup"       // 刪除分組
"aiBookmarks.renameGroup"       // 重命名分組

// 書籤操作
"aiBookmarks.addBookmarkHere"   // 在當前位置添加書籤（已有 addManual）
"aiBookmarks.editBookmark"      // 編輯書籤
"aiBookmarks.deleteBookmark"    // 刪除書籤（已有 delete）
"aiBookmarks.moveBookmark"      // 移動書籤到其他分組
"aiBookmarks.duplicateBookmark" // 複製書籤

// 批量操作
"aiBookmarks.deleteSelected"    // 刪除選中項
"aiBookmarks.moveSelected"      // 移動選中項
```

### 快捷鍵配置

```json
{
  "key": "ctrl+alt+b",
  "command": "aiBookmarks.addBookmarkHere",
  "when": "editorTextFocus"
},
{
  "key": "ctrl+shift+b",
  "command": "aiBookmarks.searchBookmarks"
},
{
  "key": "delete",
  "command": "aiBookmarks.deleteBookmark",
  "when": "view == aiBookmarks && viewItem == bookmark"
},
{
  "key": "f2",
  "command": "aiBookmarks.renameGroup",
  "when": "view == aiBookmarks && viewItem == group"
}
```

### 設置項

```json
{
  "aiBookmarks.quickAddMode": {
    "type": "string",
    "enum": ["full", "simple"],
    "default": "simple",
    "description": "快速添加書籤模式: full=完整流程, simple=只需標題"
  },
  "aiBookmarks.defaultCategory": {
    "type": "string",
    "enum": ["entry-point", "core-logic", "todo", "bug", "optimization", "explanation", "warning", "reference"],
    "default": "explanation",
    "description": "新書籤的默認分類"
  },
  "aiBookmarks.confirmBeforeDelete": {
    "type": "boolean",
    "default": true,
    "description": "刪除前是否需要確認"
  }
}
```

### 右鍵菜單結構

**編輯器右鍵菜單:**
```
─────────────────────
📌 Add Bookmark Here
─────────────────────
```

**側邊欄分組右鍵菜單:**
```
─────────────────────
✏️  Rename Group
📝 Edit Group
➕ Add Bookmark to Group
─────────────────────
🗑️  Delete Group
─────────────────────
```

**側邊欄書籤右鍵菜單:**
```
─────────────────────
📍 Go to Location
✏️  Edit Bookmark
📋 Copy Location
─────────────────────
⬆️  Move Up
⬇️  Move Down
📁 Move to Group...
─────────────────────
🗑️  Delete Bookmark
─────────────────────
```

### 實現優先級

**Phase 1 - 基礎手動操作（MVP）:**
- [x] 添加書籤（addManual 已實現基礎版）
- [x] 創建分組（createGroup 命令）
- [x] 刪除書籤/分組（delete/deleteGroup 命令）
- [x] 編輯書籤標題和說明（editBookmark 命令）

**Phase 2 - 完善編輯功能:**
- [x] 編輯書籤分類和標籤（editBookmark 命令）
- [x] 編輯分組名稱和說明（editGroup/renameGroup 命令）
- [x] 調整書籤順序（moveBookmarkUp/Down 命令）
- [x] 移動書籤到其他分組（moveBookmark 命令）

**Phase 3 - 高級功能:**
- [ ] 拖拽排序
- [ ] 拖拽移動到其他分組
- [ ] 批量操作
- [ ] Webview 編輯表單

## VSCode 擴展配置 (package.json)

```json
{
  "name": "ai-bookmarks",
  "displayName": "AI Bookmarks",
  "description": "AI-powered code bookmarks with MCP integration",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "views": {
      "explorer": [
        {
          "id": "aiBookmarks",
          "name": "AI Bookmarks",
          "icon": "icons/bookmark.svg"
        }
      ]
    },
    "commands": [
      {
        "command": "aiBookmarks.refresh",
        "title": "Refresh Bookmarks",
        "icon": "$(refresh)"
      },
      {
        "command": "aiBookmarks.jumpTo",
        "title": "Jump to Bookmark"
      },
      {
        "command": "aiBookmarks.delete",
        "title": "Delete Bookmark",
        "icon": "$(trash)"
      },
      {
        "command": "aiBookmarks.addManual",
        "title": "Add Bookmark Here"
      },
      {
        "command": "aiBookmarks.exportMarkdown",
        "title": "Export Bookmarks as Markdown"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "aiBookmarks.refresh",
          "when": "view == aiBookmarks",
          "group": "navigation"
        }
      ],
      "view/item/context": [
        {
          "command": "aiBookmarks.delete",
          "when": "view == aiBookmarks && viewItem == bookmark"
        }
      ],
      "editor/context": [
        {
          "command": "aiBookmarks.addManual",
          "group": "navigation"
        }
      ]
    },
    "configuration": {
      "title": "AI Bookmarks",
      "properties": {
        "aiBookmarks.mcpPort": {
          "type": "number",
          "default": 3333,
          "description": "MCP Server port"
        },
        "aiBookmarks.showInlineDecorations": {
          "type": "boolean",
          "default": true,
          "description": "Show bookmark icons in editor gutter"
        }
      }
    }
  }
}
```

## 開發指南

### 環境準備

```bash
# 安裝依賴
npm install

# 開發模式（watch）
npm run watch

# 編譯
npm run compile

# 打包擴展
npx vsce package
```

### 依賴項

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "esbuild": "^0.19.0",
    "@vscode/vsce": "^2.22.0"
  }
}
```

### 關鍵實現要點

1. **MCP Server 啟動方式**
   - 擴展激活時啟動 MCP Server
   - 使用 stdio 傳輸
   - 需要在 `.claude/mcp.json` 中註冊

2. **書籤存儲**
   - 使用 `.vscode/ai-bookmarks.json` 存儲
   - 文件變化時自動重新加載
   - 支持多 workspace

3. **行號漂移處理**
   - 監聽 `vscode.workspace.onDidChangeTextDocument`
   - 根據編輯位置調整書籤行號
   - 保存 codeSnapshot 用於檢測大幅變化

4. **裝飾器更新**
   - 使用 `TextEditorDecorationType` 在 gutter 顯示圖標
   - 根據 category 使用不同顏色/圖標
   - 編輯器切換時更新裝飾

## Claude Code MCP 配置

在項目中創建 `.claude/mcp.json`：

```json
{
  "mcpServers": {
    "ai-bookmarks": {
      "command": "node",
      "args": ["${workspaceFolder}/.vscode/ai-bookmarks-mcp/server.js"],
      "description": "AI 書籤管理 - 在代碼中標記和說明重要位置"
    }
  }
}
```

## 使用示例

### AI 標記代碼架構（帶分組）

用戶：「幫我理解 crash 遊戲的核心邏輯流程」

AI 會：
1. 先創建分組
2. 依序添加書籤，形成流程

```typescript
// 1. 創建分組
create_group({
  name: "Crash 遊戲核心流程",
  description: "AI 分析的遊戲主循環和關鍵節點",
  query: "幫我理解 crash 遊戲的核心邏輯流程"
})
// 返回 groupId: "grp-001"

// 2. 依序添加書籤
add_bookmark({
  groupId: "grp-001",
  location: "src/game/crash.go:45",
  order: 1,
  title: "遊戲初始化",
  description: "創建遊戲實例，初始化 multiplier 為 1.0，設置遊戲狀態為 waiting",
  category: "entry-point",
  tags: ["init", "game-loop"]
})

add_bookmark({
  groupId: "grp-001",
  location: "src/game/crash.go:78-92",
  order: 2,
  title: "下注階段處理",
  description: "收集玩家下注，驗證餘額，記錄下注時間。這個階段持續 10 秒。",
  category: "core-logic",
  tags: ["betting", "validation"]
})

add_bookmark({
  groupId: "grp-001",
  location: "src/game/crash.go:105",
  order: 3,
  title: "生成 Crash Point",
  description: "使用 provably fair 算法生成本局的 crash 點位",
  category: "core-logic",
  tags: ["random", "provably-fair"]
})

// ... 繼續添加流程中的其他節點
```

### AI 標記待修復問題

用戶：「review 這段代碼，把問題標記出來」

```typescript
// 1. 創建分組
create_group({
  name: "待優化項",
  description: "Code review 發現的問題",
  query: "review 這段代碼，把問題標記出來"
})
// 返回 groupId: "grp-002"

// 2. 添加發現的問題
add_bookmark({
  groupId: "grp-002",
  location: "src/game/crash.go:156",
  order: 1,
  title: "精度問題",
  description: "float64 計算 multiplier 可能有精度累積誤差，建議使用 decimal 庫",
  category: "optimization",
  tags: ["precision", "math"]
})

add_bookmark({
  groupId: "grp-002",
  location: "src/game/crash.go:203-210",
  order: 2,
  title: "並發安全",
  description: "結算時遍歷玩家 map 沒有加鎖，可能導致 concurrent map iteration",
  category: "bug",
  tags: ["concurrency", "critical"]
})
```

### AI 更新現有分組

用戶：「在剛才的流程裡補充一下 cash out 的邏輯」

```typescript
// AI 會找到對應分組，然後添加新書籤
add_bookmark({
  groupId: "grp-001",  // 使用已有的分組
  location: "src/game/crash.go:220-245",
  order: 6,  // 追加到流程末尾
  title: "玩家 Cash Out",
  description: "玩家可以在 crash 前提前離場，鎖定當前倍率的收益",
  category: "core-logic",
  tags: ["cashout", "player-action"]
})
```

## 後續擴展計劃

### 近期 (手動配置功能)
- [ ] **Phase 1**: 基礎手動操作 - 創建分組、刪除書籤/分組、編輯書籤
- [ ] **Phase 2**: 完善編輯 - 編輯分類標籤、調整順序
- [ ] **Phase 3**: 高級功能 - 拖拽操作、批量操作

### 中期
- [ ] 書籤搜索功能
- [ ] 書籤間關聯關係
- [ ] 導出為項目文檔

### 遠期
- [ ] 團隊書籤同步（通過 git）
- [ ] 書籤有效性檢測（代碼大幅改動時提醒）
- [ ] Webview 編輯表單

## Makefile

写出 makefile, 给出常用命令

```Makefile
.PHONY: install watch compile package clean
```