// ============================================================
// Noteriv Web Clipper - Content Script
// HTML to Markdown conversion and content extraction
// ============================================================

(function () {
  "use strict";

  // ============================================================
  // HTML to Markdown converter
  // ============================================================

  /**
   * Convert an HTML element (or string) to markdown.
   * Pure JS, no dependencies.
   */
  function htmlToMarkdown(element) {
    if (!element) return "";
    return convertNode(element).trim();
  }

  /**
   * Recursively convert a DOM node to markdown.
   */
  function convertNode(node) {
    // Text node
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.replace(/\s+/g, " ");
    }

    // Not an element node, skip
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();

    // Skip unwanted elements
    if (
      [
        "script",
        "style",
        "noscript",
        "iframe",
        "svg",
        "nav",
        "footer",
        "header",
        "aside",
        "form",
        "button",
        "input",
        "textarea",
        "select",
      ].includes(tag)
    ) {
      return "";
    }

    // Skip ads and navigation by class/id patterns
    const classId = (
      (node.className || "") +
      " " +
      (node.id || "")
    ).toLowerCase();
    if (
      /\b(ad|ads|advert|advertisement|sidebar|widget|popup|modal|cookie|banner|promo|social|share|comment|related|recommended)\b/.test(
        classId
      )
    ) {
      return "";
    }

    // Get children markdown
    const childrenMd = convertChildren(node);

    switch (tag) {
      // Headings
      case "h1":
        return "\n\n# " + childrenMd.trim() + "\n\n";
      case "h2":
        return "\n\n## " + childrenMd.trim() + "\n\n";
      case "h3":
        return "\n\n### " + childrenMd.trim() + "\n\n";
      case "h4":
        return "\n\n#### " + childrenMd.trim() + "\n\n";
      case "h5":
        return "\n\n##### " + childrenMd.trim() + "\n\n";
      case "h6":
        return "\n\n###### " + childrenMd.trim() + "\n\n";

      // Paragraphs and divs
      case "p":
        return "\n\n" + childrenMd.trim() + "\n\n";
      case "div":
        return "\n" + childrenMd + "\n";

      // Line breaks
      case "br":
        return "\n";
      case "hr":
        return "\n\n---\n\n";

      // Inline formatting
      case "strong":
      case "b":
        return "**" + childrenMd.trim() + "**";
      case "em":
      case "i":
        return "*" + childrenMd.trim() + "*";
      case "del":
      case "s":
      case "strike":
        return "~~" + childrenMd.trim() + "~~";
      case "u":
        return childrenMd; // no standard markdown for underline
      case "mark":
        return "==" + childrenMd.trim() + "==";
      case "sub":
        return "~" + childrenMd.trim() + "~";
      case "sup":
        return "^" + childrenMd.trim() + "^";

      // Links
      case "a": {
        const href = node.getAttribute("href");
        const text = childrenMd.trim();
        if (!href || href.startsWith("javascript:") || href === "#") {
          return text;
        }
        // Make relative URLs absolute
        const absoluteUrl = makeAbsolute(href);
        return "[" + text + "](" + absoluteUrl + ")";
      }

      // Images
      case "img": {
        const src = node.getAttribute("src");
        const alt = node.getAttribute("alt") || "";
        if (!src) return "";
        const absoluteSrc = makeAbsolute(src);
        return "![" + alt + "](" + absoluteSrc + ")";
      }

      // Code
      case "code": {
        // If inside a <pre>, don't add backticks (parent handles it)
        if (node.parentElement && node.parentElement.tagName.toLowerCase() === "pre") {
          return node.textContent;
        }
        return "`" + node.textContent + "`";
      }
      case "pre": {
        const codeEl = node.querySelector("code");
        const codeText = codeEl ? codeEl.textContent : node.textContent;
        // Try to detect language from class
        let lang = "";
        if (codeEl) {
          const cls = codeEl.className || "";
          const match = cls.match(/language-(\w+)/);
          if (match) lang = match[1];
        }
        return "\n\n```" + lang + "\n" + codeText.trimEnd() + "\n```\n\n";
      }

      // Lists
      case "ul":
        return "\n\n" + convertListItems(node, "ul") + "\n\n";
      case "ol":
        return "\n\n" + convertListItems(node, "ol") + "\n\n";
      case "li":
        // Handled by convertListItems
        return childrenMd;

      // Blockquote
      case "blockquote": {
        const lines = childrenMd
          .trim()
          .split("\n")
          .map((line) => "> " + line);
        return "\n\n" + lines.join("\n") + "\n\n";
      }

      // Tables
      case "table":
        return "\n\n" + convertTable(node) + "\n\n";

      // Figure
      case "figure":
        return "\n\n" + childrenMd.trim() + "\n\n";
      case "figcaption":
        return "\n*" + childrenMd.trim() + "*\n";

      // Details/summary
      case "details":
        return "\n\n" + childrenMd + "\n\n";
      case "summary":
        return "**" + childrenMd.trim() + "**\n\n";

      // Spans and other inline elements
      case "span":
      case "small":
      case "abbr":
      case "time":
      case "cite":
      case "dfn":
      case "var":
      case "samp":
      case "kbd":
        return childrenMd;

      // Everything else: just return children
      default:
        return childrenMd;
    }
  }

  /**
   * Convert all child nodes.
   */
  function convertChildren(node) {
    let result = "";
    for (const child of node.childNodes) {
      result += convertNode(child);
    }
    return result;
  }

  /**
   * Convert list items with proper prefixes.
   */
  function convertListItems(listNode, listType) {
    const items = [];
    let index = 1;
    for (const child of listNode.children) {
      if (child.tagName.toLowerCase() === "li") {
        const prefix = listType === "ol" ? index + ". " : "- ";
        const content = convertChildren(child).trim();
        items.push(prefix + content);
        index++;
      }
    }
    return items.join("\n");
  }

  /**
   * Convert an HTML table to markdown.
   */
  function convertTable(tableNode) {
    const rows = [];
    const trs = tableNode.querySelectorAll("tr");

    for (const tr of trs) {
      const cells = [];
      for (const cell of tr.children) {
        if (
          cell.tagName.toLowerCase() === "td" ||
          cell.tagName.toLowerCase() === "th"
        ) {
          cells.push(convertChildren(cell).trim().replace(/\|/g, "\\|"));
        }
      }
      rows.push("| " + cells.join(" | ") + " |");
    }

    if (rows.length === 0) return "";

    // Add separator after first row (header)
    if (rows.length >= 1) {
      const firstRow = rows[0];
      const colCount = (firstRow.match(/\|/g) || []).length - 1;
      const separator =
        "| " +
        Array(colCount)
          .fill("---")
          .join(" | ") +
        " |";
      rows.splice(1, 0, separator);
    }

    return rows.join("\n");
  }

  /**
   * Make a URL absolute (relative to the current page).
   */
  function makeAbsolute(url) {
    if (!url) return "";
    try {
      return new URL(url, window.location.href).href;
    } catch {
      return url;
    }
  }

  // ============================================================
  // Content extraction
  // ============================================================

  /**
   * Try to find the main content element on the page.
   * Falls back to document.body.
   */
  function getMainContent() {
    // Priority-ordered selectors for main content
    const selectors = [
      "article",
      "main",
      '[role="main"]',
      '[role="article"]',
      ".post-content",
      ".article-content",
      ".entry-content",
      ".content",
      "#content",
      ".post",
      ".article",
      ".entry",
      "#main",
      "#article",
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim().length > 100) {
        return el;
      }
    }

    // Fallback to body
    return document.body;
  }

  /**
   * Get full page content as markdown.
   */
  function getPageAsMarkdown() {
    const mainEl = getMainContent();
    return htmlToMarkdown(mainEl);
  }

  /**
   * Get selected text as markdown.
   * Falls back to plain text if the selection cannot be converted.
   */
  function getSelectionAsMarkdown() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return "";
    }

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();

    // Create a temporary container to hold the fragment
    const container = document.createElement("div");
    container.appendChild(fragment);

    const md = htmlToMarkdown(container);
    return md || selection.toString();
  }

  // ============================================================
  // Toast notification
  // ============================================================

  function showToast(message, success) {
    // Remove any existing toast
    const existing = document.getElementById("noteriv-clipper-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "noteriv-clipper-toast";
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      z-index: 2147483647 !important;
      background: ${success ? "#a6e3a1" : "#f38ba8"} !important;
      color: #1e1e2e !important;
      padding: 12px 20px !important;
      border-radius: 8px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
      opacity: 0 !important;
      transform: translateY(12px) !important;
      transition: opacity 0.3s ease, transform 0.3s ease !important;
      pointer-events: none !important;
    `;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(12px)";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ============================================================
  // Message listener
  // ============================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getContent") {
      const mode = message.mode || "page";
      let content;
      if (mode === "selection") {
        content = getSelectionAsMarkdown();
        if (!content) {
          content = getPageAsMarkdown(); // fallback to full page
        }
      } else {
        content = getPageAsMarkdown();
      }

      sendResponse({
        title: document.title,
        content: content,
        url: window.location.href,
      });
      return true;
    }

    if (message.action === "showToast") {
      showToast(message.message, message.success);
      return true;
    }
  });
})();
