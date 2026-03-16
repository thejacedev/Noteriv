// ============================================================
// Noteriv Web Clipper - Popup Script
// ============================================================

const API_BASE = "http://127.0.0.1:27123";

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const vaultNameEl = document.getElementById("vaultName");
const vaultNameText = document.getElementById("vaultNameText");
const disconnectedMsg = document.getElementById("disconnectedMsg");
const clipForm = document.getElementById("clipForm");
const titleInput = document.getElementById("titleInput");
const tagsInput = document.getElementById("tagsInput");
const folderInput = document.getElementById("folderInput");
const clipPageBtn = document.getElementById("clipPageBtn");
const clipSelectionBtn = document.getElementById("clipSelectionBtn");
const messageEl = document.getElementById("message");

let isConnected = false;

// ============================================================
// Initialize
// ============================================================

async function init() {
  // Check API status
  await checkConnection();

  // Pre-fill title from active tab
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.title) {
      titleInput.value = tab.title;
    }
  } catch {
    // Ignore
  }
}

// ============================================================
// Connection check
// ============================================================

async function checkConnection() {
  try {
    const res = await fetch(`${API_BASE}/status`, { method: "GET" });
    const data = await res.json();

    if (data.running) {
      isConnected = true;
      statusDot.classList.add("connected");
      statusText.textContent = "Connected";
      clipForm.style.display = "block";
      disconnectedMsg.style.display = "none";

      if (data.vault) {
        vaultNameEl.style.display = "block";
        vaultNameText.textContent = data.vault;
      }
    } else {
      showDisconnected();
    }
  } catch {
    showDisconnected();
  }
}

function showDisconnected() {
  isConnected = false;
  statusDot.classList.remove("connected");
  statusText.textContent = "Disconnected";
  clipForm.style.display = "none";
  disconnectedMsg.style.display = "block";
}

// ============================================================
// Clip handlers
// ============================================================

clipPageBtn.addEventListener("click", () => clip("page"));
clipSelectionBtn.addEventListener("click", () => clip("selection"));

async function clip(mode) {
  if (!isConnected) return;

  // Disable buttons while clipping
  clipPageBtn.disabled = true;
  clipSelectionBtn.disabled = true;
  hideMessage();

  const title = titleInput.value.trim() || "Untitled";
  const tags = tagsInput.value.trim() || undefined;
  const folder = folderInput.value.trim() || undefined;

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "clipFromPopup",
          mode: mode,
          title: title,
          tags: tags,
          folder: folder,
        },
        (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        }
      );
    });

    if (response && response.success) {
      showMessage("Clipped successfully!", "success");
    } else {
      showMessage(
        response ? response.error : "Unknown error occurred",
        "error"
      );
    }
  } catch (err) {
    showMessage(err.message || "Failed to clip", "error");
  } finally {
    clipPageBtn.disabled = false;
    clipSelectionBtn.disabled = false;
  }
}

// ============================================================
// Message display
// ============================================================

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = "message " + type;
}

function hideMessage() {
  messageEl.className = "message";
  messageEl.textContent = "";
}

// ============================================================
// Start
// ============================================================

init();
