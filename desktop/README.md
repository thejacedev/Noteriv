# Noteriv desktop

Tauri/Rust + Next.js. Markdown editor with plugin API, themes, Git/WebDAV sync, web clipper.

## Layout

```
desktop/
├── package.json           # Renderer deps + tauri scripts
├── next.config.ts         # output: export
├── src/                   # Next.js App Router renderer
├── public/                # static assets bundled with the app
└── src-tauri/             # Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── icons/
    ├── capabilities/
    └── src/
        ├── main.rs
        ├── lib.rs           # plugin registration + startup
        ├── shim.rs          # window.electronAPI shim + drag/resize polyfill
        ├── store.rs         # config.json + settings.json persistence
        ├── paths.rs         # userData dir resolution
        ├── auth.rs          # GitHub PAT storage + API
        ├── clipper.rs       # Web clipper local HTTP server
        ├── watcher.rs       # Vault file watcher (debounced)
        ├── menu.rs          # Hidden menu for keyboard accelerators
        ├── updater_cmds.rs  # tauri-plugin-updater wrappers
        └── commands_*.rs    # All IPC commands
```

## Dev setup

Requires Node 18+ and a Rust toolchain (1.77+).

System libraries (Linux):

```
sudo dnf install webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel
# Debian/Ubuntu: libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev libssl-dev
```

```bash
npm install
npm run dev      # next + tauri dev
npm run build    # next build + tauri build
```

## Implementation notes

- **Renderer compatibility**: Renderer code targets `window.electronAPI` (legacy). `src-tauri/src/shim.rs` injects a JS shim at window load that maps every method to a Tauri `invoke()` call. No renderer file was changed for the Tauri port.
- **Drag/resize polyfill**: Tauri uses `decorations: false` for the custom titlebar. The shim handles `mousedown` on `.titlebar-controls` (drag) and 6px edge hot zones (resize) since WebKitGTK ignores Chrome's `-webkit-app-region` CSS.
- **Token storage**: disk-only base64 in `~/.config/Noteriv/tokens.enc` (or platform equivalent). The OS keyring path was removed because Linux secret-service implementations pop a modal unlock dialog that fires on every git sync. Same security profile as Electron's safeStorage fallback.
- **Git ops**: shell out to `git` with `-c credential.helper=` and `-c core.askPass=` to disable any system credential helper, plus `GIT_TERMINAL_PROMPT=0` and `GIT_SSH_COMMAND="ssh -o BatchMode=yes ..."` to prevent any prompt. SSH-form remotes are auto-rewritten to HTTPS when a PAT is available.
- **WebDAV**: implemented directly with `reqwest` (PROPFIND/MKCOL/PUT/GET) + `quick-xml`.
- **Web clipper**: `tiny_http` on `127.0.0.1:27123` (auto-increments if busy).
- **File watcher**: `notify-debouncer-mini`, 300ms debounce, ignores `.git`/`.noteriv`/`.trash`/`node_modules`/hidden dirs.
- **Updater**: `tauri-plugin-updater` pointed at GitHub Releases `latest.json`. See `SIGNING.md` for release setup.

## Releasing

Push a `v*` tag — `.github/workflows/release.yml` builds Linux/Mac/Windows, generates `latest.json`, uploads to a GitHub release. Requires the `TAURI_SIGNING_PRIVATE_KEY` secret set in GitHub. See `SIGNING.md`.
