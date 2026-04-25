// JS injected at window load. Maps `window.electronAPI.*` calls to Tauri's
// invoke()/listen(), so the renderer code (which targets the Electron API)
// runs unmodified on Tauri.
//
// IMPORTANT: this string runs in the webview *before* page scripts. It must
// be self-contained (no imports), use only browser globals, and be idempotent.

pub const SHIM_JS: &str = r#"
(function () {
  if (window.__noterivShimInstalled) return;
  window.__noterivShimInstalled = true;

  // Wait for Tauri's globalTauri (loaded with `withGlobalTauri = true`).
  function ready() {
    return window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
  }

  function whenReady(cb) {
    if (ready()) return cb();
    var i = 0;
    var t = setInterval(function () {
      if (ready() || i++ > 200) { clearInterval(t); cb(); }
    }, 25);
  }

  whenReady(function () {
    var T = window.__TAURI__;
    var invoke = T.core.invoke;
    var listen = T.event && T.event.listen;

    // Snake-case command names (Tauri convention) are derived from the Rust
    // function names by tauri::generate_handler!. We use those names below.

    function on(channel, handler, mapPayload) {
      var unlisten = null;
      if (!listen) return function () {};
      listen(channel, function (e) {
        var data = e && e.payload;
        try { handler(mapPayload ? mapPayload(data) : data); } catch (err) { /* swallow */ }
      }).then(function (un) { unlisten = un; });
      return function () { try { unlisten && unlisten(); } catch (e) {} };
    }

    var api = {
      // ---- window
      windowMinimize: function () { return invoke("window_minimize"); },
      windowMaximize: function () { return invoke("window_maximize"); },
      windowClose: function () { return invoke("window_close"); },
      windowIsMaximized: function () { return invoke("window_is_maximized"); },
      getPlatform: function () { return invoke("window_platform"); },

      // ---- workspace
      loadWorkspace: function (vaultPath) { return invoke("workspace_load", { vaultPath: vaultPath }); },
      saveWorkspace: function (vaultPath, state) { return invoke("workspace_save", { args: { vaultPath: vaultPath, state: state } }); },

      // ---- file dialogs
      openFile: function () { return invoke("dialog_open_file"); },
      openFolder: function () { return invoke("dialog_open_folder"); },
      saveFileDialog: function (defaultPath) { return invoke("dialog_save_file", { args: { defaultPath: defaultPath } }); },
      showOpenDialog: function (options) { return invoke("dialog_show_open", { options: options || {} }); },
      saveHtmlDialog: function (defaultPath) { return invoke("dialog_save_html", { args: { defaultPath: defaultPath } }); },

      // ---- file system
      readFile: function (filePath) { return invoke("fs_read_file", { filePath: filePath }); },
      readBinaryFile: function (filePath) { return invoke("fs_read_binary_file", { filePath: filePath }); },
      writeFile: function (filePath, content) { return invoke("fs_write_file", { args: { filePath: filePath, content: content } }); },
      readDir: function (dirPath) { return invoke("fs_read_dir", { dirPath: dirPath }); },
      createFile: function (filePath) { return invoke("fs_create_file", { filePath: filePath }); },
      deleteFile: function (filePath) { return invoke("fs_delete_file", { filePath: filePath }); },
      deleteDir: function (dirPath) { return invoke("fs_delete_dir", { dirPath: dirPath }); },
      rename: function (oldPath, newPath) { return invoke("fs_rename", { args: { oldPath: oldPath, newPath: newPath } }); },
      createDir: function (dirPath) { return invoke("fs_create_dir", { dirPath: dirPath }); },
      copyFile: function (src, dest) { return invoke("fs_copy_file", { args: { src: src, dest: dest } }); },
      writeBinaryFile: function (filePath, b64) { return invoke("fs_write_binary_file", { args: { filePath: filePath, base64: b64 } }); },

      // ---- vault
      getConfig: function () { return invoke("vault_get_config"); },
      isSetupComplete: function () { return invoke("vault_is_setup_complete"); },
      getVaults: function () { return invoke("vault_get_all"); },
      getActiveVault: function () { return invoke("vault_get_active"); },
      createVault: function (data) { return invoke("vault_create", { data: data }); },
      updateVault: function (id, updates) { return invoke("vault_update", { args: { id: id, updates: updates } }); },
      deleteVault: function (id) { return invoke("vault_delete", { id: id }); },
      setActiveVault: function (id) { return invoke("vault_set_active", { id: id }); },

      // ---- auth
      authSaveToken: function (vaultId, token) { return invoke("auth_save_token", { args: { vaultId: vaultId, token: token } }); },
      authHasToken: function (vaultId) { return invoke("auth_has_token", { vaultId: vaultId }); },
      authRemoveToken: function (vaultId) { return invoke("auth_remove_token", { vaultId: vaultId }); },
      authValidateToken: function (token) { return invoke("auth_validate_token", { token: token }); },
      authListRepos: function (token, page) { return invoke("auth_list_repos", { args: { token: token, page: page } }); },
      authCreateRepo: function (token, name, isPrivate, description) {
        return invoke("auth_create_repo", { args: { token: token, name: name, isPrivate: isPrivate, description: description } });
      },
      authOpenTokenPage: function () { return invoke("auth_open_token_page"); },
      authGetUser: function (vaultId) { return invoke("auth_get_user", { vaultId: vaultId }); },

      // ---- git
      gitIsInstalled: function () { return invoke("git_is_installed"); },
      gitIsRepo: function (dir) { return invoke("git_is_repo", { dir: dir }); },
      gitInit: function (dir) { return invoke("git_init", { dir: dir }); },
      gitSetRemote: function (dir, url) { return invoke("git_set_remote", { args: { dir: dir, url: url } }); },
      gitStatus: function (dir) { return invoke("git_status", { dir: dir }); },
      gitSync: function (dir, message, vaultId) { return invoke("git_sync", { args: { dir: dir, message: message, vaultId: vaultId } }); },
      gitPull: function (dir, vaultId) { return invoke("git_pull", { args: { dir: dir, vaultId: vaultId } }); },
      gitFetch: function (dir, vaultId) { return invoke("git_fetch", { args: { dir: dir, vaultId: vaultId } }); },
      gitLog: function (dir, count) { return invoke("git_log", { args: { dir: dir, count: count } }); },
      gitClone: function (url, dir, vaultId) { return invoke("git_clone", { args: { url: url, dir: dir, vaultId: vaultId } }); },
      gitFileLog: function (dir, filePath) { return invoke("git_file_log", { args: { dir: dir, filePath: filePath } }); },
      gitShowFile: function (dir, filePath, hash) { return invoke("git_show_file", { args: { dir: dir, filePath: filePath, hash: hash } }); },

      // ---- settings
      loadSettings: function () { return invoke("settings_load"); },
      saveSettings: function (settings) { return invoke("settings_save", { settings: settings }); },

      // ---- shell
      openExternal: function (url) { return invoke("shell_open_external", { url: url }); },
      openPath: function (filePath) { return invoke("shell_open_path", { filePath: filePath }); },

      // ---- vault watcher
      onVaultChanged: function (cb) { return on("vault:changed", cb); },

      // ---- clipper
      clipperGetPort: function () { return invoke("clipper_get_port"); },
      clipperSetEnabled: function (enabled) { return invoke("clipper_set_enabled", { enabled: enabled }); },
      onClipperClipped: function (cb) { return on("clipper:clipped", cb); },

      // ---- updater
      updaterCheck: function () { return invoke("updater_check"); },
      updaterDownload: function () { return invoke("updater_download"); },
      updaterInstall: function () { return invoke("updater_install"); },
      updaterGetVersion: function () { return invoke("updater_get_version"); },
      onUpdaterUpdateAvailable: function (cb) { return on("updater:update-available", cb); },
      onUpdaterUpdateNotAvailable: function (cb) { return on("updater:update-not-available", function () { return undefined; }); },
      onUpdaterDownloadProgress: function (cb) { return on("updater:download-progress", cb); },
      onUpdaterUpdateDownloaded: function (cb) { return on("updater:update-downloaded", cb); },
      onUpdaterError: function (cb) { return on("updater:error", cb); },

      // ---- sync providers
      syncProviderSync: function (vaultPath, providerType, config) {
        return invoke("sync_run", { args: { vaultPath: vaultPath, providerType: providerType, config: config } });
      },
      syncProviderTest: function (providerType, config) {
        return invoke("sync_test", { args: { providerType: providerType, config: config } });
      },

      // ---- search/listing
      searchInFiles: function (dir, query) { return invoke("fs_search_in_files", { args: { dir: dir, query: query } }); },
      listAllFiles: function (dir) { return invoke("fs_list_all_files", { dir: dir }); },
      getFileStats: function (dir) { return invoke("fs_get_file_stats", { dir: dir }); },

      // ---- menu events
      onMenuSave: function (cb) { return on("menu:save", function () { return undefined; }); },
      onMenuSaveAs: function (cb) { return on("menu:save-as", function () { return undefined; }); },
      onMenuNewFile: function (cb) { return on("menu:new-file", function () { return undefined; }); },
      onMenuOpenFile: function (cb) { return on("menu:open-file", function () { return undefined; }); },
      onMenuOpenFolder: function (cb) { return on("menu:open-folder", function () { return undefined; }); },
    };

    // The original menu listeners ignore payload; rewire them to pass the user
    // callback directly instead of the noop above.
    function rebindMenu(name, channel) {
      api[name] = function (cb) {
        var unlisten = null;
        listen(channel, function () { try { cb(); } catch (e) {} }).then(function (un) { unlisten = un; });
        return function () { try { unlisten && unlisten(); } catch (e) {} };
      };
    }
    rebindMenu("onMenuSave", "menu:save");
    rebindMenu("onMenuSaveAs", "menu:save-as");
    rebindMenu("onMenuNewFile", "menu:new-file");
    rebindMenu("onMenuOpenFile", "menu:open-file");
    rebindMenu("onMenuOpenFolder", "menu:open-folder");

    Object.defineProperty(window, "electronAPI", { value: api, writable: false, configurable: false });

    // ---- Window drag region polyfill --------------------------------------
    // WebKitGTK doesn't honor Chrome's `-webkit-app-region: drag` and won't
    // even expose it via getComputedStyle, so detect the renderer's known
    // titlebar classes directly.
    var INTERACTIVE = /^(?:BUTTON|INPUT|TEXTAREA|SELECT|A|LABEL|SUMMARY)$/;
    // Only the top row of the titlebar is a drag region. The `.titlebar`
    // wrapper also contains the `.tab-bar` row, which must remain clickable
    // and HTML5-draggable for tab selection / reordering.
    var DRAG_CLASSES = ["drag-region", "titlebar-controls"];
    var NO_DRAG_CLASSES = [
      "no-drag",
      "titlebar-section", "titlebar-btn",
      "tab-bar", "tab", "tab-close", "tab-new", "tab-pinned", "tab-label",
      "view-toggle", "view-toggle-btn",
      "mac-controls", "mac-dot", "win-controls", "win-btn"
    ];

    function classListHasAny(cl, list) {
      if (!cl) return false;
      for (var i = 0; i < list.length; i++) if (cl.contains(list[i])) return true;
      return false;
    }

    function inDragRegion(target) {
      // Walk up. Stop at any no-drag / interactive ancestor before any drag ancestor.
      for (var cur = target; cur && cur.nodeType === 1; cur = cur.parentElement) {
        if (INTERACTIVE.test(cur.tagName)) return false;
        if (cur.hasAttribute && cur.hasAttribute("data-tauri-drag-region")) {
          if (cur.getAttribute("data-tauri-drag-region") === "false") return false;
          return true;
        }
        if (classListHasAny(cur.classList, NO_DRAG_CLASSES)) return false;
        if (classListHasAny(cur.classList, DRAG_CLASSES)) return true;
      }
      return false;
    }

    document.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      // Resize handler claims first via capture below; if it fired, e.defaultPrevented.
      if (e.defaultPrevented) return;
      if (!inDragRegion(e.target)) return;
      try {
        e.preventDefault();
        invoke("plugin:window|start_dragging");
      } catch (err) { /* swallow */ }
    }, false);

    document.addEventListener("dblclick", function (e) {
      if (e.button !== 0) return;
      if (!inDragRegion(e.target)) return;
      try { invoke("window_maximize"); } catch (err) {}
    }, false);

    // ---- Resize hot zones --------------------------------------------------
    // decorations:false on Linux removes all window edges. Add 6px hot zones
    // along each edge that change the cursor and trigger Tauri's resize drag.
    var EDGE = 6;

    function edgeFor(x, y) {
      var w = window.innerWidth, h = window.innerHeight;
      var top = y < EDGE, bot = y > h - EDGE, left = x < EDGE, right = x > w - EDGE;
      if (top && left) return "NorthWest";
      if (top && right) return "NorthEast";
      if (bot && left) return "SouthWest";
      if (bot && right) return "SouthEast";
      if (top) return "North";
      if (bot) return "South";
      if (left) return "West";
      if (right) return "East";
      return null;
    }

    var CURSOR_BY_EDGE = {
      NorthWest: "nwse-resize", SouthEast: "nwse-resize",
      NorthEast: "nesw-resize", SouthWest: "nesw-resize",
      North: "ns-resize", South: "ns-resize",
      East: "ew-resize", West: "ew-resize",
    };

    document.addEventListener("mousemove", function (e) {
      var edge = edgeFor(e.clientX, e.clientY);
      if (edge) {
        document.body.style.cursor = CURSOR_BY_EDGE[edge];
      } else if (document.body.style.cursor && CURSOR_BY_EDGE[document.body.style.cursor]) {
        // only clear if we set it
        document.body.style.cursor = "";
      } else if (
        document.body.style.cursor === "ns-resize" ||
        document.body.style.cursor === "ew-resize" ||
        document.body.style.cursor === "nwse-resize" ||
        document.body.style.cursor === "nesw-resize"
      ) {
        document.body.style.cursor = "";
      }
    }, true);

    document.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      var edge = edgeFor(e.clientX, e.clientY);
      if (!edge) return;
      try {
        e.preventDefault();
        e.stopPropagation();
        invoke("plugin:window|start_resize_dragging", { value: edge });
      } catch (err) { /* swallow */ }
    }, true); // capture: claim resize before drag handler
  });
})();
"#;
