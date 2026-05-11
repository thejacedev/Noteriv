# Build scripts

## Windows portable build

`build-windows-portable.ps1` packages a portable zip. Two flavors:

### Lite (default) — small, requires system WebView2

```powershell
./build-windows-portable.ps1
```

Produces `bundles/Noteriv-<version>-windows-x64-portable.zip` containing:
- `noteriv.exe`
- `portable.txt` (marker — triggers portable mode at runtime)
- `README.txt`

WebView2 must be installed on the target machine (default on Win11, preinstalled
on most patched Win10).

### Fixed runtime — 100% portable, ~150 MB

```powershell
./build-windows-portable.ps1 -FixedRuntime C:\path\to\webview2-runtime
```

The path argument is a folder containing the extracted Microsoft Edge WebView2
Fixed Version Runtime. Download from
https://developer.microsoft.com/en-us/microsoft-edge/webview2/ under
**Fixed Version**, extract the CAB, and pass the resulting folder.

Produces `bundles/Noteriv-<version>-windows-x64-portable-fixedruntime.zip`
containing the EXE + portable marker + bundled runtime folder. Runs on Windows
machines that have no WebView2 installed.

## How portable mode works

The app detects portable mode at startup if either:
1. `portable.txt` exists next to the EXE, or
2. `NOTERIV_PORTABLE=1` is set in the environment.

When portable, all data (`config.json`, `settings.json`, `tokens.enc`, plus
WebView2's IndexedDB / localStorage / cache) is written to `data/` next to
the EXE. The auto-updater is disabled. No registry writes, no `%APPDATA%`.

Implementation: `src-tauri/src/paths.rs::portable_root()`.
