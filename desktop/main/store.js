const { app } = require("electron");
const path = require("path");
const fs = require("fs");

// Stores vault configs and app settings in the user's app data directory
// e.g. ~/.config/Noteriv/config.json (Linux), ~/Library/Application Support/Noteriv/config.json (macOS), %APPDATA%/Noteriv/config.json (Windows)

const CONFIG_DIR = path.join(app.getPath("userData"));
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const SETTINGS_FILE = path.join(CONFIG_DIR, "settings.json");

const DEFAULT_CONFIG = {
  vaults: [],       // [{ id, name, path, gitRemote, gitBranch, autoSync, lastOpened }]
  activeVaultId: null,
  setupComplete: false,
};

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readConfig() {
  ensureDir();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // corrupted config, reset
  }
  return { ...DEFAULT_CONFIG };
}

function writeConfig(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Public API ---

function getConfig() {
  return readConfig();
}

function isSetupComplete() {
  return readConfig().setupComplete;
}

function getVaults() {
  return readConfig().vaults;
}

function getActiveVault() {
  const config = readConfig();
  if (!config.activeVaultId) return null;
  return config.vaults.find((v) => v.id === config.activeVaultId) || null;
}

function createVault({ name, vaultPath, gitRemote, gitBranch, autoSync }) {
  const config = readConfig();
  const id = generateId();

  // Ensure the vault directory exists
  if (!fs.existsSync(vaultPath)) {
    fs.mkdirSync(vaultPath, { recursive: true });
  }

  const vault = {
    id,
    name,
    path: vaultPath,
    gitRemote: gitRemote || null,
    gitBranch: gitBranch || "main",
    autoSync: autoSync || false,
    lastOpened: Date.now(),
  };

  config.vaults.push(vault);
  config.activeVaultId = id;
  config.setupComplete = true;
  writeConfig(config);

  return vault;
}

function updateVault(id, updates) {
  const config = readConfig();
  const idx = config.vaults.findIndex((v) => v.id === id);
  if (idx === -1) return null;

  config.vaults[idx] = { ...config.vaults[idx], ...updates };
  writeConfig(config);
  return config.vaults[idx];
}

function deleteVault(id) {
  const config = readConfig();
  config.vaults = config.vaults.filter((v) => v.id !== id);
  if (config.activeVaultId === id) {
    config.activeVaultId = config.vaults.length > 0 ? config.vaults[0].id : null;
  }
  if (config.vaults.length === 0) {
    config.setupComplete = false;
  }
  writeConfig(config);
  return true;
}

function setActiveVault(id) {
  const config = readConfig();
  const vault = config.vaults.find((v) => v.id === id);
  if (!vault) return null;

  config.activeVaultId = id;
  vault.lastOpened = Date.now();
  writeConfig(config);
  return vault;
}

// --- Settings (global, not per-vault) ---

function loadSettings() {
  ensureDir();
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function saveSettings(settings) {
  ensureDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  return true;
}

module.exports = {
  getConfig,
  isSetupComplete,
  getVaults,
  getActiveVault,
  createVault,
  updateVault,
  deleteVault,
  setActiveVault,
  loadSettings,
  saveSettings,
};
