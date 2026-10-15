#!/usr/bin/env node
// Cross-platform wrapper for `tauri dev`.
//
// WEBKIT_DISABLE_DMABUF_RENDERER / WEBKIT_DISABLE_COMPOSITING_MODE work around
// WebKitGTK rendering bugs on Linux. They are shell env-var assignments
// (`VAR=1 cmd`), which only cmd.exe/PowerShell on Windows can't parse — and
// they don't apply on Windows (WebView2) or macOS (WKWebView) anyway, so this
// only sets them when actually running on Linux.
const { spawn } = require("child_process");

const env = { ...process.env };
if (process.platform === "linux") {
  env.WEBKIT_DISABLE_DMABUF_RENDERER = "1";
  env.WEBKIT_DISABLE_COMPOSITING_MODE = "1";
}

const child = spawn("npx", ["tauri", "dev"], {
  stdio: "inherit",
  env,
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
