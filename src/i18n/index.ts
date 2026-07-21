import { create } from "zustand";
import { emit, getSystemLocale } from "../ipc";

const zh: Record<string, string> = {
  // app
  "app.title": "Textora",
  "app.errorTitle": "出错了",
  "app.reload": "重新加载",

  // menu bar
  "menu.file": "文件",
  "menu.view": "视图",
  "menu.activate": "激活",
  "menu.close": "关闭",
  "menu.closeOthers": "关闭其他",
  "menu.closeAll": "关闭全部",

  // basic ops
  "new": "新建",
  "open": "打开",
  "save": "保存",
  "saveAs": "另存为",
  "find": "查找",
  "export": "导出",
  "source": "源码",
  "typewriter": "打字机",
  "focus": "专注",
  "sidebar": "文件",
  "outline": "大纲",
  "theme": "主题",
  "settings": "设置",

  // welcome
  "welcome.subtitle": "所见即所得的 Markdown 编辑器",
  "welcome.recent": "最近打开",

  // settings
  "settings.title": "首选项",
  "settings.close": "关闭",
  "settings.general": "通用",
  "settings.editor": "编辑器",
  "settings.view": "视图",
  "settings.theme": "主题",
  "settings.theme.light": "浅色",
  "settings.theme.dark": "深色",
  "settings.theme.sepia": "护眼",
  "settings.theme.nord": "Nord",
  "settings.language": "语言",
  "settings.fontSize": "字体大小",
  "settings.fontFamily": "字体",
  "settings.autoSave": "自动保存（秒）",
  "settings.spellcheck": "拼写检查",
  "settings.sidebarVisible": "文件树",
  "settings.outlineVisible": "大纲",
  "settings.focusMode": "专注模式",
  "settings.typewriterMode": "打字机模式",
  "settings.sourceMode": "源码模式",
  "settings.readingMode": "阅读模式",
  "settings.shortcuts": "快捷键",
  "settings.shortcuts.hint": "点击后按快捷键可自定义绑定",
  "settings.shortcuts.recording": "请按键…",
  "settings.shortcuts.reset": "重置",
  "settings.shortcuts.resetAll": "重置全部",
  "settings.shortcuts.conflict": "\"{name}\" 已使用该快捷键",

  // unsaved confirm
  "splitView": "\u5206\u5c4f\u89c6\u56fe",
  "sc.toggleSplit": "\u5207\u6362\u5206\u5c4f",
  "unsaved.title": "未保存的修改",
  "unsaved.message": "「{name}」有未保存的修改，关闭前要保存吗？",
  "unsaved.openMessage": "「{name}」有未保存的修改，打开「{name2}」前要保存吗？",
  "unsaved.save": "保存",
  "unsaved.discard": "不保存",
  "unsaved.cancel": "取消",

  // export
  "export.pdf": "导出 PDF",
  "export.html": "导出 HTML",
  "export.docx": "导出 Word 兼容 (.doc)",
  "export.png": "导出 PNG 图片",
  "format.bold": "加粗",
  "format.italic": "斜体",
  "format.strikethrough": "删除线",
  "format.inlineCode": "行内代码",
  "format.link": "链接",
  "slash.h1": "标题 1",
  "slash.h2": "标题 2",
  "slash.h3": "标题 3",
  "slash.quote": "引用",
  "slash.code": "代码块",
  "slash.ul": "无序列表",
  "slash.ol": "有序列表",
  "slash.task": "任务列表",
  "slash.hr": "分割线",
  "slash.table": "表格",
  "slash.math": "数学公式",
  "slash.mermaid": "Mermaid 图表",
  "workspace.close": "关闭工作区",
  "export.failed": "导出失败",

  // search
  "search.placeholder": "搜索",
  "search.workspacePlaceholder": "在工作区内搜索…",
  "search.replacePlaceholder": "替换为",
  "search.caseSensitive": "区分大小写",
  "search.regex": "正则",
  "search.next": "下一个",
  "search.prev": "上一个",
  "search.replace": "替换",
  "search.replaceAll": "全部替换",
  "search.close": "关闭",
  "search.result": "{count} 个匹配",
  "search.noResult": "无匹配",
  "search.startHint": "输入关键字开始搜索（支持正则与大小写）。",
  "search.searching": "搜索中…",
  "search.noResults": "无匹配结果",
  "search.resultCount": "{count} 个结果",

  // find replace panel
  "find.placeholder": "查找…",
  "find.replace": "替换为…",
  "find.replaceOne": "替换",
  "find.replaceAll": "全部替换",
  "find.toggleReplace": "切换替换",

  // findReplace (legacy compat)
  "findReplace.find": "查找",
  "findReplace.replaceWith": "替换为",
  "findReplace.replace": "替换",
  "findReplace.replaceAll": "全部替换",

  // auto save
  "autoSave.off": "关闭",
  "autoSave.30s": "30 秒",
  "autoSave.1m": "1 分钟",
  "autoSave.5m": "5 分钟",

  // shortcuts
  "sc.category.file": "文件",
  "sc.category.edit": "编辑",
  "sc.category.view": "视图",
  "sc.category.tabs": "标签",
  "sc.newFile": "新建文件",
  "sc.openFile": "打开文件",
  "sc.openFolder": "打开文件夹",
  "sc.save": "保存",
  "sc.saveAs": "另存为",
  "sc.find": "查找替换",
  "sc.searchInFiles": "在文件中查找",
  "sc.quickOpen": "快速打开",
  "sc.commandPalette": "命令面板",
  "sc.gotoLine": "转到行",
  "sc.toggleSidebar": "切换文件树",
  "sc.toggleSource": "切换源码模式",
  "sc.toggleReading": "切换阅读模式",
  "sc.toggleTheme": "切换主题",
  "sc.toggleFocus": "切换专注模式",
  "sc.toggleTypewriter": "切换打字机模式",
  "sc.closeTab": "关闭标签页",
  "sc.nextTab": "下一个标签页",
  "sc.prevTab": "上一个标签页",

  // context menu
  "ctx.cut": "剪切",
  "ctx.copy": "复制",
  "ctx.paste": "粘贴",
  "ctx.selectAll": "全选",
  "ctx.find": "查找",
  "ctx.replace": "替换",
  "ctx.insertImage": "插入图片",
  "ctx.insertLink": "插入链接",
  "ctx.insertTable": "插入表格",
  "ctx.insertCodeBlock": "插入代码块",
  "ctx.insertMath": "插入公式",
  "ctx.toggleSource": "切换源码模式",
  "ctx.toggleReading": "切换阅读模式",
  "ctx.toggleFocus": "切换专注模式",
  "ctx.insertHeading": "标题",
  "ctx.insertBold": "粗体",
  "ctx.insertItalic": "斜体",
  "ctx.insertQuote": "引用",
  "ctx.insertHr": "分隔线",
  "ctx.insert": "插入",
  "ctx.insertMermaid": "插入 Mermaid 图表",
  "ctx.insertTaskList": "插入任务列表",
  "ctx.insertBulletList": "插入无序列表",
  "ctx.insertOrderedList": "插入有序列表",
  "ctx.pastePlain": "粘贴为纯文本",
  "ctx.format": "格式",
  "ctx.bold": "粗体",
  "ctx.italic": "斜体",
  "ctx.underline": "下划线",
  "ctx.code": "行内代码",
  "ctx.strikethrough": "删除线",
  "ctx.highlight": "高亮",
  "ctx.superscript": "上标",
  "ctx.subscript": "下标",
  "ctx.clearFormat": "清除格式",
  "ctx.heading": "标题",
  "ctx.heading1": "标题 1",
  "ctx.heading2": "标题 2",
  "ctx.heading3": "标题 3",
  "ctx.heading4": "标题 4",
  "ctx.heading5": "标题 5",
  "ctx.heading6": "标题 6",
  "ctx.undo": "撤销",
  "ctx.redo": "重做",
  "ctx.copyAsMarkdown": "复制为 Markdown",
  "ctx.copyAsPlainText": "复制为纯文本",
  "ctx.openFileLocation": "打开文件位置",
  "ctx.insertLink.prompt": "请输入链接地址：",
  "ctx.insertLink.defaultUrl": "https://",

  // status bar
  "status.reading": "阅读模式",
  "status.unsaved": "未保存",
  "status.words": "字",
  "status.chars": "字符",
  "status.lines": "行",
  "status.minutes": "分钟",
  "status.ln": "行",
  "status.col": "列",
  "status.sel": "选",
  "status.lineEnding": "切换行尾 (LF / CRLF)",
  "status.encoding": "切换编码",
  "status.insertMode": "Insert 键切换插入/改写模式",

  // outline
  "outline.empty": "暂无大纲",

  // quick open
  "quickopen.title": "快速打开",
  "quickopen.placeholder": "输入文件名…",
  "quickopen.noWorkspace": "未打开工作区",
  "quickopen.loading": "加载中…",
  "quickopen.noResults": "无匹配文件",

  // sidebar
  "sidebar.files": "文件",
  "sidebar.outline": "大纲",
  "sidebar.dragToResize": "拖拽调整宽度",

  // file tree
  "filetree.refresh": "刷新",
  "filetree.newFile": "新建文件",
  "filetree.newFolder": "新建文件夹",
  "filetree.copyPath": "复制路径",
  "filetree.rename": "重命名",
  "filetree.delete": "删除",
  "filetree.empty": "空文件夹",
  "filetree.noWorkspace": "尚未打开工作区",
  "filetree.openFolder": "打开文件夹",
  "filetree.addFile": "新建文件",
  "filetree.addFolder": "新建文件夹",
  "filetree.filter": "筛选文件…",

  // diff view
  "diff.title": "文件比较",
  "diff.swap": "交换",
  "diff.left": "原始",
  "diff.right": "修改",
  "diff.loading": "加载中…",
  "diff.selectPrompt": "请选择两个文件进行比较",
  "diff.compareFiles": "比较文件…",
  "diff.empty": "（空文件）",
  "diff.notSelected": "（未选择）",
  "diff.pickLeft": "选择原始文件",
  "diff.pickRight": "选择修改后文件",

  // command palette
  "commandPalette.placeholder": "输入命令…",
  "commandPalette.noResults": "无匹配命令",
  "commandPalette.gotoLine": "转到行",
  "commandPalette.closeTab": "关闭标签页",
  "commandPalette.searchInFiles": "在文件中查找",

  // dialogs
  "dialog.openFile": "打开文件",
  "dialog.saveAs": "另存为",
  "dialog.openFailed": "打开失败",
  "dialog.saveFailed": "保存失败",
  "dialog.createFailed": "创建失败",
  "dialog.renameFailed": "重命名失败",
  "dialog.deleteFailed": "删除失败",
  "dialog.largeFileTitle": "大文件警告",
  "dialog.largeFileMsg": "此文件大小为 {size}，编辑时可能会卡顿。建议仅查看或使用源码模式。",
  "dialog.deleteTitle": "删除",
  "dialog.deleteConfirm": "确定删除 {name} 吗？",
  "dialog.readDirFailed": "读取目录失败",
  "dialog.watchFailed": "监听失败",
  "dialog.fileChangedTitle": "文件已变更",
  "dialog.fileChangedMsg": "「{name}」在 Textora 外被修改，是否重新加载？",

  // common
  "common.untitled": "未命名",
  "common.allFiles": "所有文件",

  // ai
  "ai.welcome": "你好！我是 AI 写作助手，可以帮你编辑文档、生成内容、解释代码等。\n\n在下方输入你的问题，按 Enter 发送。",
  "ai.placeholder": "输入你的问题…",
  "ai.send": "发送",
  "ai.errorNoKey": "请先在设置中配置 API Key",
  "ai.errorUnknown": "请求失败，请检查网络连接和 API 配置",
  "ai.quickActions": "快捷指令",
  "ai.notEnabled": "AI 助手尚未启用或缺少 API Key。",
  "ai.configure": "前往设置",
  "ai.action.plan": "规划本文档",
  "ai.action.ideas": "提供写作思路",
  "ai.action.continue": "续写",
  "ai.action.polish": "润色全文",
  "ai.action.plan.prompt": "请为这篇文档规划合理的结构大纲（多级标题）与每部分的写作要点，并给出可落地的思路建议。若文档已有内容，请在其基础上优化大纲、指出可补充的方向。",
  "ai.action.ideas.prompt": "请围绕这篇文档的主题，提供几个有深度的写作角度与可落地的思路、可能的论据或案例方向。",
  "ai.action.continue.prompt": "请基于文档现有内容，自然地续写接下来的 1–2 段，保持原有语气与风格。",
  "ai.action.polish.prompt": "请润色并改进这篇文档（保持原意与 Markdown 格式，提升表达与逻辑）。",

  // settings - ai
  "settings.ai": "AI 助手",
  "settings.ai.provider": "供应商",
  "settings.ai.apiKey": "API Key",
  "settings.ai.endpoint": "接口地址",
  "settings.ai.model": "模型",
  "settings.ai.enabled": "启用 AI 助手",
  "settings.ai.open": "打开 AI 助手",
  "settings.ai.hint": "配置仅保存在本机，不会上传。",

  // tab
  "tab.dirty": "未保存",

  "sc.toggleBookmark": "切换书签",
  "sc.nextBookmark": "下一个书签",
  "sc.prevBookmark": "上一个书签",
};

const en: Record<string, string> = {
  // app
  "app.title": "Textora",
  "app.errorTitle": "Something Went Wrong",
  "app.reload": "Reload",

  // menu bar
  "menu.file": "File",
  "menu.view": "View",
  "menu.activate": "Activate",
  "menu.close": "Close",
  "menu.closeOthers": "Close Others",
  "menu.closeAll": "Close All",

  // basic ops
  "new": "New",
  "open": "Open",
  "save": "Save",
  "saveAs": "Save As",
  "find": "Find",
  "export": "Export",
  "source": "Source",
  "typewriter": "Typewriter",
  "focus": "Focus",
  "sidebar": "Files",
  "outline": "Outline",
  "theme": "Theme",
  "settings": "Settings",

  // welcome
  "welcome.subtitle": "WYSIWYG Markdown Editor",
  "welcome.recent": "Recent",

  // settings
  "settings.title": "Preferences",
  "settings.close": "Close",
  "settings.general": "General",
  "settings.editor": "Editor",
  "settings.view": "View",
  "settings.theme": "Theme",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.theme.sepia": "Sepia",
  "settings.theme.nord": "Nord",
  "settings.language": "Language",
  "settings.fontSize": "Font Size",
  "settings.fontFamily": "Font Family",
  "settings.autoSave": "Auto Save (s)",
  "settings.spellcheck": "Spell Check",
  "settings.sidebarVisible": "File Tree",
  "settings.outlineVisible": "Outline",
  "settings.focusMode": "Focus Mode",
  "settings.typewriterMode": "Typewriter Mode",
  "settings.sourceMode": "Source Mode",
  "settings.readingMode": "Reading Mode",
  "settings.shortcuts": "Shortcuts",
  "settings.shortcuts.hint": "Click then press keys to customize",
  "settings.shortcuts.recording": "Press keys…",
  "settings.shortcuts.reset": "Reset",
  "settings.shortcuts.resetAll": "Reset All",
  "settings.shortcuts.conflict": "\"{name}\" already uses that shortcut",

  // unsaved confirm
  "unsaved.title": "Unsaved Changes",
  "unsaved.message": "\"{name}\" has unsaved changes. Save before closing?",
  "unsaved.openMessage": "\"{name}\" has unsaved changes. Save before opening \"{name2}\"?",
  "unsaved.save": "Save",
  "unsaved.discard": "Discard",
  "unsaved.cancel": "Cancel",

  // export
  "export.pdf": "Export PDF",
  "export.html": "Export HTML",
  "export.docx": "Export Word-compatible (.doc)",
  "export.png": "Export PNG Image",
  "format.bold": "Bold",
  "format.italic": "Italic",
  "format.strikethrough": "Strikethrough",
  "format.inlineCode": "Inline Code",
  "format.link": "Link",
  "slash.h1": "Heading 1",
  "slash.h2": "Heading 2",
  "slash.h3": "Heading 3",
  "slash.quote": "Quote",
  "slash.code": "Code Block",
  "slash.ul": "Bullet List",
  "slash.ol": "Numbered List",
  "slash.task": "Task List",
  "slash.hr": "Divider",
  "slash.table": "Table",
  "slash.math": "Math Formula",
  "slash.mermaid": "Mermaid Diagram",
  "workspace.close": "Close Workspace",
  "export.failed": "Export Failed",

  // search
  "search.placeholder": "Search",
  "search.workspacePlaceholder": "Search in workspace…",
  "search.replacePlaceholder": "Replace with",
  "search.caseSensitive": "Case sensitive",
  "search.regex": "Regex",
  "search.next": "Next",
  "search.prev": "Previous",
  "search.replace": "Replace",
  "search.replaceAll": "Replace All",
  "search.close": "Close",
  "search.result": "{count} matches",
  "search.noResult": "No matches",
  "search.startHint": "Type keywords to search (supports regex and case sensitivity).",
  "search.searching": "Searching…",
  "search.noResults": "No results",
  "search.resultCount": "{count} results",

  // find replace panel
  "find.placeholder": "Find…",
  "find.replace": "Replace with…",
  "find.replaceOne": "Replace",
  "find.replaceAll": "Replace All",
  "find.toggleReplace": "Toggle replace",

  // findReplace (legacy compat)
  "findReplace.find": "Find",
  "findReplace.replaceWith": "Replace with",
  "findReplace.replace": "Replace",
  "findReplace.replaceAll": "Replace All",

  // auto save
  "autoSave.off": "Off",
  "autoSave.30s": "30 sec",
  "autoSave.1m": "1 min",
  "autoSave.5m": "5 min",

  // shortcuts
  "sc.category.file": "File",
  "sc.category.edit": "Edit",
  "sc.category.view": "View",
  "sc.category.tabs": "Tabs",
  "sc.newFile": "New File",
  "sc.openFile": "Open File",
  "sc.openFolder": "Open Folder",
  "sc.save": "Save",
  "sc.saveAs": "Save As",
  "sc.find": "Find / Replace",
  "sc.searchInFiles": "Search in Files",
  "sc.quickOpen": "Quick Open",
  "sc.commandPalette": "Command Palette",
  "sc.gotoLine": "Go to Line",
  "sc.toggleSidebar": "Toggle File Tree",
  "sc.toggleSource": "Toggle Source Mode",
  "sc.toggleReading": "Toggle Reading Mode",
  "sc.toggleTheme": "Toggle Theme",
  "sc.toggleFocus": "Toggle Focus Mode",
  "sc.toggleTypewriter": "Toggle Typewriter Mode",
  "sc.closeTab": "Close Tab",
  "sc.nextTab": "Next Tab",
  "sc.prevTab": "Previous Tab",

  // context menu
  "ctx.cut": "Cut",
  "ctx.copy": "Copy",
  "ctx.paste": "Paste",
  "ctx.selectAll": "Select All",
  "ctx.find": "Find",
  "ctx.replace": "Replace",
  "ctx.insertImage": "Insert Image",
  "ctx.insertLink": "Insert Link",
  "ctx.insertTable": "Insert Table",
  "ctx.insertCodeBlock": "Insert Code Block",
  "ctx.insertMath": "Insert Math",
  "ctx.toggleSource": "Toggle Source Mode",
  "ctx.toggleReading": "Toggle Reading Mode",
  "ctx.toggleFocus": "Toggle Focus Mode",
  "ctx.insertHeading": "Heading",
  "ctx.insertBold": "Bold",
  "ctx.insertItalic": "Italic",
  "ctx.insertQuote": "Quote",
  "ctx.insertHr": "Horizontal Rule",
  "ctx.insert": "Insert",
  "ctx.insertMermaid": "Insert Mermaid Chart",
  "ctx.insertTaskList": "Insert Task List",
  "ctx.insertBulletList": "Insert Bullet List",
  "ctx.insertOrderedList": "Insert Ordered List",
  "ctx.pastePlain": "Paste as Plain Text",
  "ctx.format": "Format",
  "ctx.bold": "Bold",
  "ctx.italic": "Italic",
  "ctx.underline": "Underline",
  "ctx.code": "Inline Code",
  "ctx.strikethrough": "Strikethrough",
  "ctx.highlight": "Highlight",
  "ctx.superscript": "Superscript",
  "ctx.subscript": "Subscript",
  "ctx.clearFormat": "Clear Format",
  "ctx.heading": "Heading",
  "ctx.heading1": "Heading 1",
  "ctx.heading2": "Heading 2",
  "ctx.heading3": "Heading 3",
  "ctx.heading4": "Heading 4",
  "ctx.heading5": "Heading 5",
  "ctx.heading6": "Heading 6",
  "ctx.undo": "Undo",
  "ctx.redo": "Redo",
  "ctx.copyAsMarkdown": "Copy as Markdown",
  "ctx.copyAsPlainText": "Copy as Plain Text",
  "ctx.openFileLocation": "Open File Location",
  "ctx.insertLink.prompt": "Enter URL:",
  "ctx.insertLink.defaultUrl": "https://",

  // status bar
  "status.reading": "Reading",
  "status.unsaved": "Unsaved",
  "status.words": "words",
  "status.chars": "chars",
  "status.lines": "lines",
  "status.minutes": "min",
  "status.ln": "Ln",
  "status.col": "Col",
  "status.sel": "Sel",
  "status.lineEnding": "Toggle line ending (LF / CRLF)",
  "status.encoding": "Toggle encoding",
  "status.insertMode": "Insert key toggles insert/overwrite",

  // outline
  "outline.empty": "No outline",

  // quick open
  "quickopen.title": "Quick Open",
  "quickopen.placeholder": "Type file name…",
  "quickopen.noWorkspace": "No workspace open",
  "quickopen.loading": "Loading…",
  "quickopen.noResults": "No matching files",

  // sidebar
  "sidebar.files": "Files",
  "sidebar.outline": "Outline",
  "sidebar.dragToResize": "Drag to resize",

  // file tree
  "filetree.refresh": "Refresh",
  "filetree.newFile": "New File",
  "filetree.newFolder": "New Folder",
  "filetree.copyPath": "Copy Path",
  "filetree.rename": "Rename",
  "filetree.delete": "Delete",
  "filetree.empty": "Empty folder",
  "filetree.noWorkspace": "No workspace open",
  "filetree.openFolder": "Open Folder",
  "filetree.addFile": "New File",
  "filetree.addFolder": "New Folder",
  "filetree.filter": "Filter files…",

  // diff view
  "diff.title": "Compare Files",
  "diff.swap": "Swap",
  "diff.left": "Original",
  "diff.right": "Modified",
  "diff.loading": "Loading…",
  "diff.selectPrompt": "Select two files to compare",
  "diff.compareFiles": "Compare Files…",
  "diff.empty": "(empty)",
  "diff.notSelected": "(not selected)",
  "diff.pickLeft": "Select original file",
  "diff.pickRight": "Select modified file",

  // command palette
  "commandPalette.placeholder": "Type a command…",
  "commandPalette.noResults": "No matching commands",
  "commandPalette.gotoLine": "Go to Line",
  "commandPalette.closeTab": "Close Tab",
  "commandPalette.searchInFiles": "Search in Files",

  // dialogs
  "dialog.openFile": "Open File",
  "dialog.saveAs": "Save As",
  "dialog.openFailed": "Open Failed",
  "dialog.saveFailed": "Save Failed",
  "dialog.createFailed": "Create Failed",
  "dialog.renameFailed": "Rename Failed",
  "dialog.deleteFailed": "Delete Failed",
  "dialog.largeFileTitle": "Large File Warning",
  "dialog.largeFileMsg": "This file is {size}. Editing may be slow. Consider view-only or source mode.",
  "dialog.deleteTitle": "Delete",
  "dialog.deleteConfirm": "Delete {name}?",
  "dialog.readDirFailed": "Read Dir Failed",
  "dialog.watchFailed": "Watch Failed",
  "dialog.fileChangedTitle": "File Changed",
  "dialog.fileChangedMsg": "\"{name}\" was modified outside Textora. Reload?",

  // common
  "common.untitled": "Untitled",
  "common.allFiles": "All Files",

  // ai
  "ai.welcome": "Hello! I'm an AI writing assistant. I can help you edit documents, generate content, explain code, and more.\n\nType your question below and press Enter to send.",
  "ai.placeholder": "Type your question…",
  "ai.send": "Send",
  "ai.errorNoKey": "Please configure API Key in settings first",
  "ai.errorUnknown": "Request failed, check network and API configuration",
  "ai.quickActions": "Quick Actions",
  "ai.notEnabled": "AI Assistant is not enabled or the API Key is missing.",
  "ai.configure": "Go to Settings",
  "ai.action.plan": "Plan Document",
  "ai.action.ideas": "Brainstorm Ideas",
  "ai.action.continue": "Continue Writing",
  "ai.action.polish": "Polish",
  "ai.action.plan.prompt": "Please plan a clear outline for this document (multi-level headings) with key points per section, and suggest actionable writing directions. If content already exists, optimize the outline based on it and point out where it can be expanded.",
  "ai.action.ideas.prompt": "Please suggest several deep writing angles and actionable ideas, possible arguments or case directions, around this document's topic.",
  "ai.action.continue.prompt": "Please naturally continue writing the next 1–2 paragraphs based on the existing content, keeping the original tone and style.",
  "ai.action.polish.prompt": "Please polish and improve this document (keep the original meaning and Markdown format, enhance expression and logic).",

  // settings - ai
  "settings.ai": "AI Assistant",
  "settings.ai.provider": "Provider",
  "settings.ai.apiKey": "API Key",
  "settings.ai.endpoint": "Endpoint",
  "settings.ai.model": "Model",
  "settings.ai.enabled": "Enable AI Assistant",
  "settings.ai.open": "Open AI Assistant",
  "settings.ai.hint": "Config is stored locally only and never uploaded.",

  // tab
  "tab.dirty": "Unsaved",

  "sc.toggleBookmark": "Toggle Bookmark",
  "sc.nextBookmark": "Next Bookmark",
  "sc.prevBookmark": "Previous Bookmark",
  "sc.clearBookmarks": "Clear All Bookmarks",

  "sc.macroRecord": "Record/Stop Macro",
  "sc.macroPlay": "Play Macro",
  "ai.newChat": "New Chat",
  "ai.history": "History",
  "ai.model": "Model",
  "ai.selectModel": "Select Model",
  "ai.projectDir": "Project Directory",
  "ai.browse": "Browse",
  "ai.noProviders": "No configured providers, go to settings to configure",
  "ai.configured": "Configured",
  "ai.addProvider": "Add Provider",
  "settings.ai.multiProvider": "Multi-Provider Management",
  "settings.ai.add": "Add",
  "settings.ai.delete": "Delete",
};

export type Locale = "zh" | "en";

export function getMessages(locale: Locale) {
  return locale === "zh" ? zh : en;
}

export function t(key: string, locale: Locale): string {
  const messages = getMessages(locale);
  return messages[key] ?? key;
}

// ---- zustand-based locale store ----

interface LocaleState {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

/** 根据 Electron app.getLocale() 结果匹配支持的语言 */
function detectSystemLocale(): Locale {
  try {
    // 在渲染进程通过 IPC 获取
    // 注意：此函数需在 store 创建前调用，但 IPC 需运行时执行
    // 因此先用 "zh" 占位，再异步检测
    return "zh";
  } catch {
    return "zh";
  }
}

export const useLocale = create<LocaleState>((set) => ({
  locale: detectSystemLocale(),
  setLocale: (l) => {
    set({ locale: l });
    // 通知主进程重建原生菜单
    void emit("set-locale", l);
  },
}));

/** 应用启动时异步检测系统语言并应用（需窗口创建后 IPC 可用时调用） */
export async function initSystemLocale(): Promise<void> {
  try {
    const sysLocale = await getSystemLocale();
    const normalized: Locale = sysLocale.toLowerCase().startsWith("zh") ? "zh" : "en";
    useLocale.getState().setLocale(normalized);
  } catch {
    // IPC 不可用时保持默认值（zh）
  }
}

export function tFor(locale: Locale) {
  return (key: string) => t(key, locale);
}
