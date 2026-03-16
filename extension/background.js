const API_BASE = "http://127.0.0.1:27123";

// ============================================================
// Context menu setup
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "clip-page",
    title: "Clip Page to Noteriv",
    contexts: ["page"],
  });

  chrome.contextMenus.create({
    id: "clip-selection",
    title: "Clip Selection to Noteriv",
    contexts: ["selection"],
  });
});

// ============================================================
// Context menu click handler
// ============================================================

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "clip-page") {
    clipFromContextMenu(tab, "page");
  } else if (info.menuItemId === "clip-selection") {
    clipFromContextMenu(tab, "selection");
  }
});

async function clipFromContextMenu(tab, mode) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "getContent",
      mode: mode,
    });

    if (!response || !response.content) {
      console.error("[Noteriv Clipper] No content received from content script");
      return;
    }

    const result = await clipToNoteriv({
      title: response.title || tab.title || "Untitled",
      content: response.content,
      url: tab.url,
    });

    // Notify the content script to show a toast
    chrome.tabs.sendMessage(tab.id, {
      action: "showToast",
      success: result.success,
      message: result.success
        ? "Clipped to Noteriv!"
        : `Clip failed: ${result.error}`,
    });
  } catch (err) {
    console.error("[Noteriv Clipper] Context menu clip failed:", err);
  }
}

// ============================================================
// API communication
// ============================================================

async function clipToNoteriv({ title, content, url, tags, folder }) {
  try {
    const res = await fetch(`${API_BASE}/clip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, url, tags, folder }),
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: "Cannot connect to Noteriv. Is the app running?" };
  }
}

async function checkStatus() {
  try {
    const res = await fetch(`${API_BASE}/status`, { method: "GET" });
    return await res.json();
  } catch {
    return { running: false };
  }
}

// ============================================================
// Message handler (from popup and content script)
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "checkStatus") {
    checkStatus().then(sendResponse);
    return true; // keep channel open for async response
  }

  if (message.action === "clip") {
    clipToNoteriv(message.data).then((result) => {
      sendResponse(result);

      // Show toast in the active tab
      if (sender.tab) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "showToast",
          success: result.success,
          message: result.success
            ? "Clipped to Noteriv!"
            : `Clip failed: ${result.error}`,
        });
      }
    });
    return true;
  }

  if (message.action === "clipFromPopup") {
    // Popup requests: get content from active tab, then clip
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }
      const tab = tabs[0];
      chrome.tabs.sendMessage(
        tab.id,
        { action: "getContent", mode: message.mode || "page" },
        (contentResponse) => {
          if (chrome.runtime.lastError || !contentResponse) {
            sendResponse({
              success: false,
              error: "Could not access page content. Try refreshing the page.",
            });
            return;
          }

          clipToNoteriv({
            title: message.title || contentResponse.title || tab.title || "Untitled",
            content: contentResponse.content,
            url: tab.url,
            tags: message.tags,
            folder: message.folder,
          }).then((result) => {
            // Show toast in tab
            chrome.tabs.sendMessage(tab.id, {
              action: "showToast",
              success: result.success,
              message: result.success
                ? "Clipped to Noteriv!"
                : `Clip failed: ${result.error}`,
            });
            sendResponse(result);
          });
        }
      );
    });
    return true;
  }
});
