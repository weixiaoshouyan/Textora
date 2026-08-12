/**
 * Store slice 共享状态（模块级单例）
 *
 * 原 useAppStore create 闭包内的跨函数共享状态，拆分为 slice 后提升到模块级。
 * 由于 store 本身是模块单例，语义与原先的 create 闭包一致。
 */

/** 防止同一标签的并发保存导致磁盘/标签内容不一致；保存中存 Promise，重入时复用（等待而非丢弃） */
export const savingTabs = new Map<string, Promise<void>>();

/** 文件打开冷却期跟踪：避免文件打开时立即触发"文件已变更"弹窗 */
export const openedFilesWithCooling = new Map<string, number>();

/** 正在等待「文件已变动」对话框结果的 tab 路径集合，避免同文件多次变动弹一堆窗 */
export const pendingPromptTabs = new Set<string>();
