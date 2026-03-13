const { safeStorage, shell } = require("electron");
const https = require("https");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

const TOKEN_FILE = path.join(app.getPath("userData"), "tokens.enc");

// ============================================================
// Token encryption using OS keychain (safeStorage)
// macOS: Keychain, Linux: Secret Service/kwallet, Windows: DPAPI
// ============================================================

function saveToken(vaultId, token) {
  const tokens = loadAllTokens();
  if (safeStorage.isEncryptionAvailable()) {
    tokens[vaultId] = safeStorage.encryptString(token).toString("base64");
  } else {
    // Fallback: base64 only (less secure, but works)
    tokens[vaultId] = Buffer.from(token).toString("base64");
  }
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens), "utf-8");
}

function getToken(vaultId) {
  const tokens = loadAllTokens();
  const encrypted = tokens[vaultId];
  if (!encrypted) return null;

  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } else {
      return Buffer.from(encrypted, "base64").toString("utf-8");
    }
  } catch {
    return null;
  }
}

function removeToken(vaultId) {
  const tokens = loadAllTokens();
  delete tokens[vaultId];
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens), "utf-8");
}

function loadAllTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

// ============================================================
// GitHub API helpers
// ============================================================

function ghRequest(method, urlPath, token, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: urlPath,
      method,
      headers: {
        "User-Agent": "Noteriv",
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            resolve(data);
          }
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Validate a token and get user info
async function validateToken(token) {
  try {
    const user = await ghRequest("GET", "/user", token);
    return {
      valid: true,
      username: user.login,
      name: user.name || user.login,
      avatar: user.avatar_url,
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// List user's repos (for repo picker)
async function listRepos(token, page = 1) {
  const repos = await ghRequest(
    "GET",
    `/user/repos?sort=updated&per_page=30&page=${page}&affiliation=owner,collaborator`,
    token
  );
  return repos.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    cloneUrl: r.clone_url,
    sshUrl: r.ssh_url,
    description: r.description,
    updatedAt: r.updated_at,
  }));
}

// Create a new repo
async function createRepo(token, name, isPrivate = true, description = "") {
  const repo = await ghRequest("POST", "/user/repos", token, {
    name,
    private: isPrivate,
    description: description || `Notes vault managed by Noteriv`,
    auto_init: true,
  });
  return {
    name: repo.name,
    fullName: repo.full_name,
    cloneUrl: repo.clone_url,
    sshUrl: repo.ssh_url,
    private: repo.private,
  };
}

// Open GitHub PAT creation page in browser
function openTokenPage() {
  shell.openExternal(
    "https://github.com/settings/tokens/new?scopes=repo&description=Noteriv"
  );
}

// Build an authenticated clone URL with token embedded
// Format: https://oauth2:TOKEN@github.com/user/repo.git
function getAuthenticatedUrl(cloneUrl, token) {
  try {
    const url = new URL(cloneUrl);
    url.username = "oauth2";
    url.password = token;
    return url.toString();
  } catch {
    return cloneUrl;
  }
}

module.exports = {
  saveToken,
  getToken,
  removeToken,
  validateToken,
  listRepos,
  createRepo,
  openTokenPage,
  getAuthenticatedUrl,
};
