const http = require("http");
const path = require("path");
const fs = require("fs");
const store = require("./store");

const DEFAULT_PORT = 27123;

let server = null;
let currentPort = DEFAULT_PORT;
let onClipCallback = null;

/** Set a callback that fires after a successful clip */
function setOnClip(cb) {
  onClipCallback = cb;
}

/**
 * Sanitize a string for use as a filename.
 * Removes or replaces characters that are invalid in file names.
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200); // limit length
}

/**
 * Build frontmatter block for the clipped note.
 */
function buildFrontmatter({ title, url, tags }) {
  const now = new Date();
  const clipped = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const lines = ["---"];
  lines.push(`title: "${title.replace(/"/g, '\\"')}"`);
  if (url) lines.push(`url: "${url}"`);
  lines.push(`clipped: ${clipped}`);
  if (tags && tags.length > 0) {
    lines.push(`tags: [${tags.map((t) => `"${t.trim()}"`).join(", ")}]`);
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Parse incoming JSON body from a request.
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        resolve(body);
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Set CORS headers on a response (allow any origin for extension access).
 */
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * Send a JSON response.
 */
function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Handle GET /status
 */
function handleStatus(req, res) {
  const vault = store.getActiveVault();
  sendJson(res, 200, {
    running: true,
    vault: vault ? vault.name : null,
    vaultPath: vault ? vault.path : null,
  });
}

/**
 * Handle POST /clip
 */
async function handleClip(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJson(res, 400, { success: false, error: err.message });
    return;
  }

  const { title, content, url, tags, folder } = body;

  if (!title || !content) {
    sendJson(res, 400, {
      success: false,
      error: "Missing required fields: title, content",
    });
    return;
  }

  const vault = store.getActiveVault();
  if (!vault) {
    sendJson(res, 500, {
      success: false,
      error: "No active vault. Please open Noteriv and select a vault.",
    });
    return;
  }

  const vaultPath = vault.path;

  // Determine save directory
  let saveDir = vaultPath;
  if (folder) {
    saveDir = path.join(vaultPath, folder);
  }

  // Ensure directory exists
  try {
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
  } catch (err) {
    sendJson(res, 500, {
      success: false,
      error: `Failed to create directory: ${err.message}`,
    });
    return;
  }

  // Build file content
  const parsedTags = tags
    ? Array.isArray(tags)
      ? tags
      : tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const frontmatter = buildFrontmatter({ title, url, tags: parsedTags });
  const fileContent = frontmatter + "\n\n" + content;

  // Sanitize filename and ensure uniqueness
  let baseName = sanitizeFilename(title);
  if (!baseName) baseName = "Clipped Note";
  let fileName = baseName + ".md";
  let filePath = path.join(saveDir, fileName);

  // If file exists, add a numeric suffix
  let counter = 1;
  while (fs.existsSync(filePath)) {
    fileName = `${baseName} (${counter}).md`;
    filePath = path.join(saveDir, fileName);
    counter++;
  }

  // Write the file
  try {
    fs.writeFileSync(filePath, fileContent, "utf-8");
    sendJson(res, 200, { success: true, filePath });
    if (onClipCallback) onClipCallback(filePath);
  } catch (err) {
    sendJson(res, 500, {
      success: false,
      error: `Failed to write file: ${err.message}`,
    });
  }
}

/**
 * Main request handler.
 */
async function requestHandler(req, res) {
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split("?")[0]; // strip query params

  if (req.method === "GET" && url === "/status") {
    return handleStatus(req, res);
  }

  if (req.method === "POST" && url === "/clip") {
    return handleClip(req, res);
  }

  sendJson(res, 404, { error: "Not found" });
}

/**
 * Start the clipper HTTP server.
 * Listens only on localhost for security.
 */
function startServer(port) {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(currentPort);
      return;
    }

    currentPort = port || DEFAULT_PORT;
    server = http.createServer(requestHandler);

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        // Try next port
        console.warn(
          `[Clipper] Port ${currentPort} in use, trying ${currentPort + 1}`
        );
        server = null;
        startServer(currentPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });

    server.listen(currentPort, "127.0.0.1", () => {
      console.log(`[Clipper] Server running on http://127.0.0.1:${currentPort}`);
      resolve(currentPort);
    });
  });
}

/**
 * Stop the clipper HTTP server.
 */
function stopServer() {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      console.log("[Clipper] Server stopped");
      server = null;
      resolve();
    });
  });
}

/**
 * Get the current port the server is listening on.
 */
function getPort() {
  return currentPort;
}

/**
 * Check if the server is currently running.
 */
function isRunning() {
  return server !== null;
}

module.exports = {
  startServer,
  stopServer,
  getPort,
  isRunning,
  setOnClip,
  DEFAULT_PORT,
};
