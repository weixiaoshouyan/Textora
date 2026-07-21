/**
 * electron-updater 类型声明
 * 在 npm install 完成前提供基本类型支持
 */
declare module 'electron-updater' {
  import { Logger } from 'electron-log';

  interface UpdateInfo {
    version: string;
    releaseNotes?: string | null;
    releaseDate?: string;
  }

  interface AppUpdater {
    logger: Logger | null;
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    checkForUpdates(): Promise<{ updateInfo: UpdateInfo } | null>;
    downloadUpdate(): Promise<string[]>;
    quitAndInstall(): void;
    on(event: 'update-available', listener: (info: UpdateInfo) => void): this;
    on(event: 'update-not-available', listener: (info: UpdateInfo) => void): this;
    on(event: 'update-downloaded', listener: (info: UpdateInfo) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'download-progress', listener: (progress: { percent: number }) => void): this;
  }

  export const autoUpdater: AppUpdater;
}
