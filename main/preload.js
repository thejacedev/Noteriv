const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowMaximize: () => ipcRenderer.invoke("window:maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),
  windowIsMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  getPlatform: () => ipcRenderer.invoke("window:platform"),

  // Workspace state
  loadWorkspace: (vaultPath) => ipcRenderer.invoke("workspace:load", vaultPath),
  saveWorkspace: (vaultPath, state) =>
    ipcRenderer.invoke("workspace:save", { vaultPath, state }),

  // File dialogs
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  saveFileDialog: (defaultPath) =>
    ipcRenderer.invoke("dialog:saveFile", { defaultPath }),

  // File system
  readFile: (filePath) => ipcRenderer.invoke("fs:readFile", filePath),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke("fs:writeFile", { filePath, content }),
  readDir: (dirPath) => ipcRenderer.invoke("fs:readDir", dirPath),
  createFile: (filePath) => ipcRenderer.invoke("fs:createFile", filePath),
  deleteFile: (filePath) => ipcRenderer.invoke("fs:deleteFile", filePath),
  deleteDir: (dirPath) => ipcRenderer.invoke("fs:deleteDir", dirPath),
  rename: (oldPath, newPath) => ipcRenderer.invoke("fs:rename", { oldPath, newPath }),
  createDir: (dirPath) => ipcRenderer.invoke("fs:createDir", dirPath),

  // Vault management
  getConfig: () => ipcRenderer.invoke("vault:getConfig"),
  isSetupComplete: () => ipcRenderer.invoke("vault:isSetupComplete"),
  getVaults: () => ipcRenderer.invoke("vault:getAll"),
  getActiveVault: () => ipcRenderer.invoke("vault:getActive"),
  createVault: (data) => ipcRenderer.invoke("vault:create", data),
  updateVault: (id, updates) =>
    ipcRenderer.invoke("vault:update", { id, updates }),
  deleteVault: (id) => ipcRenderer.invoke("vault:delete", id),
  setActiveVault: (id) => ipcRenderer.invoke("vault:setActive", id),

  // GitHub auth
  authSaveToken: (vaultId, token) =>
    ipcRenderer.invoke("auth:saveToken", { vaultId, token }),
  authHasToken: (vaultId) => ipcRenderer.invoke("auth:hasToken", vaultId),
  authRemoveToken: (vaultId) => ipcRenderer.invoke("auth:removeToken", vaultId),
  authValidateToken: (token) => ipcRenderer.invoke("auth:validateToken", token),
  authListRepos: (token, page) =>
    ipcRenderer.invoke("auth:listRepos", { token, page }),
  authCreateRepo: (token, name, isPrivate, description) =>
    ipcRenderer.invoke("auth:createRepo", { token, name, isPrivate, description }),
  authOpenTokenPage: () => ipcRenderer.invoke("auth:openTokenPage"),
  authGetUser: (vaultId) => ipcRenderer.invoke("auth:getUser", vaultId),

  // Git operations (vault-aware for auth)
  gitIsInstalled: () => ipcRenderer.invoke("git:isInstalled"),
  gitIsRepo: (dir) => ipcRenderer.invoke("git:isRepo", dir),
  gitInit: (dir) => ipcRenderer.invoke("git:init", dir),
  gitSetRemote: (dir, url) =>
    ipcRenderer.invoke("git:setRemote", { dir, url }),
  gitStatus: (dir) => ipcRenderer.invoke("git:status", dir),
  gitSync: (dir, message, vaultId) =>
    ipcRenderer.invoke("git:sync", { dir, message, vaultId }),
  gitPull: (dir, vaultId) =>
    ipcRenderer.invoke("git:pull", { dir, vaultId }),
  gitFetch: (dir, vaultId) =>
    ipcRenderer.invoke("git:fetch", { dir, vaultId }),
  gitLog: (dir, count) =>
    ipcRenderer.invoke("git:log", { dir, count }),
  gitClone: (url, dir, vaultId) =>
    ipcRenderer.invoke("git:clone", { url, dir, vaultId }),

  // Settings
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),

  // Sync providers
  syncProviderSync: (vaultPath, providerType, config) =>
    ipcRenderer.invoke("sync:run", { vaultPath, providerType, config }),
  syncProviderTest: (providerType, config) =>
    ipcRenderer.invoke("sync:test", { providerType, config }),

  // Search / file listing
  searchInFiles: (dir, query) =>
    ipcRenderer.invoke("fs:searchInFiles", { dir, query }),
  listAllFiles: (dir) => ipcRenderer.invoke("fs:listAllFiles", dir),

  // Updater
  updaterCheck: () => ipcRenderer.invoke("updater:check"),
  updaterDownload: () => ipcRenderer.invoke("updater:download"),
  updaterInstall: () => ipcRenderer.invoke("updater:install"),
  updaterGetVersion: () => ipcRenderer.invoke("updater:getVersion"),
  onUpdaterUpdateAvailable: (callback) => {
    ipcRenderer.on("updater:update-available", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("updater:update-available");
  },
  onUpdaterUpdateNotAvailable: (callback) => {
    ipcRenderer.on("updater:update-not-available", () => callback());
    return () => ipcRenderer.removeAllListeners("updater:update-not-available");
  },
  onUpdaterDownloadProgress: (callback) => {
    ipcRenderer.on("updater:download-progress", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("updater:download-progress");
  },
  onUpdaterUpdateDownloaded: (callback) => {
    ipcRenderer.on("updater:update-downloaded", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("updater:update-downloaded");
  },
  onUpdaterError: (callback) => {
    ipcRenderer.on("updater:error", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("updater:error");
  },

  // Menu events
  onMenuSave: (callback) => {
    ipcRenderer.on("menu:save", callback);
    return () => ipcRenderer.removeListener("menu:save", callback);
  },
  onMenuSaveAs: (callback) => {
    ipcRenderer.on("menu:save-as", callback);
    return () => ipcRenderer.removeListener("menu:save-as", callback);
  },
  onMenuNewFile: (callback) => {
    ipcRenderer.on("menu:new-file", callback);
    return () => ipcRenderer.removeListener("menu:new-file", callback);
  },
  onMenuOpenFile: (callback) => {
    ipcRenderer.on("menu:open-file", callback);
    return () => ipcRenderer.removeListener("menu:open-file", callback);
  },
  onMenuOpenFolder: (callback) => {
    ipcRenderer.on("menu:open-folder", callback);
    return () => ipcRenderer.removeListener("menu:open-folder", callback);
  },
});
