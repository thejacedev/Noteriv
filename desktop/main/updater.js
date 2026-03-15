const { autoUpdater } = require("electron-updater");
const { ipcMain } = require("electron");

let mainWindow = null;

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function initUpdater(win) {
  mainWindow = win;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    sendToRenderer("updater:update-available", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("update-not-available", () => {
    sendToRenderer("updater:update-not-available", null);
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("updater:download-progress", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendToRenderer("updater:update-downloaded", {
      version: info.version,
    });
  });

  autoUpdater.on("error", (err) => {
    sendToRenderer("updater:error", { message: err?.message || "Update error" });
  });

  // IPC handlers
  ipcMain.handle("updater:check", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo) {
        return {
          available: true,
          version: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate,
          releaseNotes: result.updateInfo.releaseNotes,
        };
      }
      return { available: false };
    } catch (err) {
      return { available: false, error: err?.message || "Check failed" };
    }
  });

  ipcMain.handle("updater:download", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("updater:install", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle("updater:getVersion", () => {
    const { app } = require("electron");
    return app.getVersion();
  });
}

function checkForUpdates() {
  autoUpdater.checkForUpdates().catch(() => {});
}

module.exports = { initUpdater, checkForUpdates };
