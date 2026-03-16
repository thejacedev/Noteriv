const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const _serve = require("electron-serve");
const serve = _serve.default || _serve;
const store = require("./store");
const gitOps = require("./sync/git");
const auth = require("./auth");
const syncOps = require("./sync");
const { initUpdater, checkForUpdates } = require("./updater");
const clipperServer = require("./clipper-server");

const isProd = process.env.NODE_ENV === "production" || app.isPackaged;

let loadURL;
if (isProd) {
  loadURL = serve({ directory: path.join(__dirname, "../out") });
}

let mainWindow;

// ============================================================
// Vault file watcher
// ============================================================

let vaultWatcher = null;
let vaultChangeDebounce = null;

function startVaultWatch(vaultPath) {
  if (vaultWatcher) {
    vaultWatcher.close();
    vaultWatcher = null;
  }
  if (!vaultPath || !fs.existsSync(vaultPath)) return;

  const watchers = new Map();
  const noterivInternal = path.join(vaultPath, ".noteriv");

  function notifyChange(filePath) {
    if (vaultChangeDebounce) clearTimeout(vaultChangeDebounce);
    vaultChangeDebounce = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("vault:changed", filePath);
      }
    }, 300);
  }

  function watchDir(dir) {
    if (watchers.has(dir)) return;
    try {
      const w = fs.watch(dir, (_, filename) => {
        const fullPath = filename ? path.join(dir, filename) : dir;
        // Watch newly created subdirectories
        try {
          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()
              && !path.basename(fullPath).startsWith(".")) {
            walkAndWatch(fullPath);
          }
        } catch {}
        // Ignore internal .noteriv changes to avoid loops
        if (!fullPath.startsWith(noterivInternal)) {
          notifyChange(fullPath);
        }
      });
      watchers.set(dir, w);
    } catch {}
  }

  function walkAndWatch(dir) {
    watchDir(dir);
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          walkAndWatch(path.join(dir, entry.name));
        }
      }
    } catch {}
  }

  walkAndWatch(vaultPath);
  vaultWatcher = {
    close: () => { watchers.forEach((w) => { try { w.close(); } catch {} }); watchers.clear(); },
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: "Noteriv",
    icon: path.join(__dirname, "../public/icon.png"),
    backgroundColor: "#1e1e2e",
    frame: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: -100, y: -100 }, // hide native macOS buttons
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isProd) {
    loadURL(mainWindow);
  } else {
    mainWindow.loadURL("http://localhost:3456");
  }

  // Hide the menu bar on Windows/Linux (we have custom controls)
  mainWindow.setMenuBarVisibility(false);

  // Keep keyboard shortcuts working via hidden menu
  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "New File", accelerator: "CmdOrCtrl+N", click: () => mainWindow.webContents.send("menu:new-file") },
        { label: "Open File", accelerator: "CmdOrCtrl+O", click: () => mainWindow.webContents.send("menu:open-file") },
        { type: "separator" },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => mainWindow.webContents.send("menu:save") },
        { label: "Save As", accelerator: "CmdOrCtrl+Shift+S", click: () => mainWindow.webContents.send("menu:save-as") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "toggleDevTools" }, { type: "separator" },
        { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" },
        { type: "separator" }, { role: "togglefullscreen" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function tokenForVault(vaultId) {
  if (!vaultId) return null;
  return auth.getToken(vaultId);
}

// ============================================================
// Window control IPC handlers
// ============================================================

ipcMain.handle("window:minimize", () => mainWindow.minimize());
ipcMain.handle("window:maximize", () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle("window:close", () => mainWindow.close());
ipcMain.handle("window:isMaximized", () => mainWindow.isMaximized());
ipcMain.handle("window:platform", () => process.platform);

// ============================================================
// Shell IPC handlers
// ============================================================

ipcMain.handle("shell:openExternal", (_, url) => {
  if (typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"))) {
    return shell.openExternal(url);
  }
});

ipcMain.handle("dialog:saveHtml", async (_, { defaultPath }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [
      { name: "HTML", extensions: ["html"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle("shell:openPath", (_, filePath) => {
  if (typeof filePath === "string") {
    return shell.openPath(filePath);
  }
});

// ============================================================
// Workspace state IPC handlers
// ============================================================

ipcMain.handle("workspace:load", (_, vaultPath) => {
  const wsPath = path.join(vaultPath, ".noteriv", "workspace.json");
  try {
    if (fs.existsSync(wsPath)) {
      return JSON.parse(fs.readFileSync(wsPath, "utf-8"));
    }
  } catch {}
  return null;
});

ipcMain.handle("workspace:save", (_, { vaultPath, state }) => {
  const wsDir = path.join(vaultPath, ".noteriv");
  const wsPath = path.join(wsDir, "workspace.json");
  try {
    if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(wsPath, JSON.stringify(state, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
});

// ============================================================
// File system IPC handlers
// ============================================================

ipcMain.handle("dialog:openFile", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "txt"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, "utf-8");
  return { filePath, content };
});

ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:showOpenDialog", async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return { canceled: result.canceled, filePaths: result.filePaths };
});

ipcMain.handle("dialog:saveFile", async (_, { defaultPath }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [
      { name: "Markdown", extensions: ["md"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle("fs:readFile", async (_, filePath) => { try { return fs.readFileSync(filePath, "utf-8"); } catch { return null; } });
ipcMain.handle("fs:readBinaryFile", async (_, filePath) => { try { return fs.readFileSync(filePath).toString("base64"); } catch { return null; } });
ipcMain.handle("fs:writeFile", async (_, { filePath, content }) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  } catch { return false; }
});
ipcMain.handle("fs:readDir", async (_, dirPath) => {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: path.join(dirPath, e.name), isDirectory: e.isDirectory() }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
  } catch { return []; }
});
ipcMain.handle("fs:createFile", async (_, filePath) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, "", "utf-8");
    return true;
  } catch { return false; }
});
ipcMain.handle("fs:deleteFile", async (_, filePath) => { try { fs.unlinkSync(filePath); return true; } catch { return false; } });
ipcMain.handle("fs:deleteDir", async (_, dirPath) => { try { fs.rmSync(dirPath, { recursive: true, force: true }); return true; } catch { return false; } });
ipcMain.handle("fs:rename", async (_, { oldPath, newPath }) => { try { fs.renameSync(oldPath, newPath); return true; } catch { return false; } });
ipcMain.handle("fs:createDir", async (_, dirPath) => { try { fs.mkdirSync(dirPath, { recursive: true }); return true; } catch { return false; } });
ipcMain.handle("fs:copyFile", async (_, { src, dest }) => {
  try {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
  } catch { return false; }
});
ipcMain.handle("fs:writeBinaryFile", async (_, { filePath, base64 }) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    return true;
  } catch { return false; }
});

// ============================================================
// Vault IPC handlers
// ============================================================

ipcMain.handle("vault:getConfig", () => store.getConfig());
ipcMain.handle("vault:isSetupComplete", () => store.isSetupComplete());
ipcMain.handle("vault:getAll", () => store.getVaults());
ipcMain.handle("vault:getActive", () => store.getActiveVault());
ipcMain.handle("vault:create", (_, data) => store.createVault(data));
ipcMain.handle("vault:update", (_, { id, updates }) => store.updateVault(id, updates));
ipcMain.handle("vault:delete", (_, id) => { auth.removeToken(id); return store.deleteVault(id); });
ipcMain.handle("vault:setActive", (_, id) => {
  const vault = store.setActiveVault(id);
  if (vault) startVaultWatch(vault.path);
  return vault;
});

// ============================================================
// GitHub Auth IPC handlers
// ============================================================

ipcMain.handle("auth:saveToken", (_, { vaultId, token }) => { auth.saveToken(vaultId, token); return true; });
ipcMain.handle("auth:hasToken", (_, vaultId) => auth.getToken(vaultId) !== null);
ipcMain.handle("auth:removeToken", (_, vaultId) => { auth.removeToken(vaultId); return true; });
ipcMain.handle("auth:validateToken", (_, token) => auth.validateToken(token));
ipcMain.handle("auth:listRepos", (_, { token, page }) => auth.listRepos(token, page));
ipcMain.handle("auth:createRepo", (_, { token, name, isPrivate, description }) => auth.createRepo(token, name, isPrivate, description));
ipcMain.handle("auth:openTokenPage", () => { auth.openTokenPage(); return true; });
ipcMain.handle("auth:getUser", async (_, vaultId) => {
  const token = auth.getToken(vaultId);
  if (!token) return null;
  const result = await auth.validateToken(token);
  return result.valid ? result : null;
});

// ============================================================
// Git IPC handlers (token-aware)
// ============================================================

ipcMain.handle("git:isInstalled", () => gitOps.isGitInstalled());
ipcMain.handle("git:isRepo", (_, dir) => gitOps.isGitRepo(dir));
ipcMain.handle("git:init", (_, dir) => gitOps.initRepo(dir));
ipcMain.handle("git:setRemote", (_, { dir, url }) => gitOps.setRemote(dir, url));
ipcMain.handle("git:status", (_, dir) => gitOps.getStatus(dir));
ipcMain.handle("git:sync", (_, { dir, message, vaultId }) => gitOps.sync(dir, message, tokenForVault(vaultId)));
ipcMain.handle("git:pull", (_, { dir, vaultId }) => gitOps.pull(dir, tokenForVault(vaultId)));
ipcMain.handle("git:fetch", (_, { dir, vaultId }) => gitOps.fetch(dir, tokenForVault(vaultId)));
ipcMain.handle("git:log", (_, { dir, count }) => gitOps.getLog(dir, count));
ipcMain.handle("git:clone", (_, { url, dir, vaultId }) => gitOps.cloneRepo(url, dir, tokenForVault(vaultId)));

// Git file history (for note history timeline)
ipcMain.handle("git:fileLog", async (_, { dir, filePath }) => {
  const { execSync } = require("child_process");
  try {
    const relativePath = path.relative(dir, filePath).replace(/\\/g, "/");
    const output = execSync(
      `git log --follow --pretty=format:"%H|%an|%ad|%s" -- "${relativePath}"`,
      { cwd: dir, encoding: "utf-8", timeout: 10000 }
    );
    if (!output.trim()) return [];
    return output.trim().split("\n").map((line) => {
      const [hash, author, date, ...msgParts] = line.split("|");
      return { hash, author, date, message: msgParts.join("|") };
    });
  } catch {
    return [];
  }
});

ipcMain.handle("git:showFile", async (_, { dir, filePath, hash }) => {
  const { execSync } = require("child_process");
  try {
    const relativePath = path.relative(dir, filePath).replace(/\\/g, "/");
    return execSync(
      `git show ${hash}:"${relativePath}"`,
      { cwd: dir, encoding: "utf-8", timeout: 10000 }
    );
  } catch {
    return null;
  }
});

// ============================================================
// Settings IPC handlers
// ============================================================

ipcMain.handle("settings:load", () => store.loadSettings());
ipcMain.handle("settings:save", (_, settings) => store.saveSettings(settings));

// ============================================================
// Sync provider IPC handlers (folder, webdav, s3)
// ============================================================

ipcMain.handle("sync:run", async (_, { vaultPath, providerType, config }) => {
  return await syncOps.performSync(vaultPath, providerType, config);
});
ipcMain.handle("sync:test", async (_, { providerType, config }) => {
  return await syncOps.testConnection(providerType, config);
});

// ============================================================
// Search across vault files
// ============================================================

ipcMain.handle("fs:searchInFiles", async (_, { dir, query }) => {
  const results = [];
  if (!query || !dir) return results;

  const lowerQuery = query.toLowerCase();

  function walkDir(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith(".md") || entry.name.endsWith(".markdown")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(lowerQuery)) {
              results.push({
                filePath: fullPath,
                fileName: entry.name,
                line: i + 1,
                text: lines[i].trim(),
              });
              if (results.length >= 200) return;
            }
          }
        } catch {}
      }
    }
  }

  walkDir(dir);
  return results;
});

// List all markdown files in vault (for quick open)
ipcMain.handle("fs:listAllFiles", async (_, dir) => {
  const files = [];
  if (!dir) return files;

  function walkDir(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith(".md") || entry.name.endsWith(".markdown")) {
        files.push({
          filePath: fullPath,
          fileName: entry.name.replace(/\.(md|markdown)$/i, ""),
          relativePath: fullPath.replace(dir + "/", "").replace(dir + "\\", ""),
        });
      }
    }
  }

  walkDir(dir);
  return files;
});

// ============================================================
// Web Clipper IPC handlers
// ============================================================

ipcMain.handle("clipper:getPort", () => clipperServer.getPort());
ipcMain.handle("clipper:setEnabled", async (_, enabled) => {
  if (enabled) {
    await clipperServer.startServer();
  } else {
    await clipperServer.stopServer();
  }
});

// ============================================================
// App lifecycle
// ============================================================

app.whenReady().then(async () => {
  createWindow();
  initUpdater(mainWindow);

  // Start watching the active vault for external file changes
  const activeVault = store.getActiveVault();
  if (activeVault) startVaultWatch(activeVault.path);

  // Start the web clipper server
  try {
    await clipperServer.startServer();
    clipperServer.setOnClip((filePath) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("clipper:clipped", filePath);
      }
    });
  } catch (err) {
    console.error("[Clipper] Failed to start server:", err);
  }

  // Auto-check for updates on startup if enabled (production only)
  if (isProd) {
    const settings = store.loadSettings();
    if (settings.autoUpdate !== false) {
      setTimeout(() => checkForUpdates(), 5000);
    }
  }
});
app.on("window-all-closed", () => {
  if (vaultWatcher) vaultWatcher.close();
  clipperServer.stopServer();
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
