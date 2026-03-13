import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  keymap,
} from "@codemirror/view";
import {
  Extension,
  StateField,
  StateEffect,
  Transaction,
} from "@codemirror/state";

// ─── Command Definitions ───

interface SlashCommand {
  name: string;
  label: string;
  description: string;
  icon: string; // Simple SVG string
  insert: () => string;
}

const commands: SlashCommand[] = [
  {
    name: "heading1",
    label: "Heading 1",
    description: "Large heading",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><text x="2" y="13" font-size="13" font-weight="bold" fill="currentColor">H1</text></svg>',
    insert: () => "# ",
  },
  {
    name: "heading2",
    label: "Heading 2",
    description: "Medium heading",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><text x="2" y="13" font-size="13" font-weight="bold" fill="currentColor">H2</text></svg>',
    insert: () => "## ",
  },
  {
    name: "heading3",
    label: "Heading 3",
    description: "Small heading",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><text x="2" y="13" font-size="13" font-weight="bold" fill="currentColor">H3</text></svg>',
    insert: () => "### ",
  },
  {
    name: "heading4",
    label: "Heading 4",
    description: "Tiny heading",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><text x="2" y="13" font-size="12" font-weight="bold" fill="currentColor">H4</text></svg>',
    insert: () => "#### ",
  },
  {
    name: "heading5",
    label: "Heading 5",
    description: "Smaller heading",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><text x="2" y="13" font-size="12" font-weight="bold" fill="currentColor">H5</text></svg>',
    insert: () => "##### ",
  },
  {
    name: "heading6",
    label: "Heading 6",
    description: "Smallest heading",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><text x="2" y="13" font-size="12" font-weight="bold" fill="currentColor">H6</text></svg>',
    insert: () => "###### ",
  },
  {
    name: "bullet",
    label: "Bullet List",
    description: "Unordered list item",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="2" fill="currentColor"/><line x1="8" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    insert: () => "- ",
  },
  {
    name: "numbered",
    label: "Numbered List",
    description: "Ordered list item",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><text x="1" y="11" font-size="10" font-weight="bold" fill="currentColor">1.</text><line x1="8" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    insert: () => "1. ",
  },
  {
    name: "todo",
    label: "To-do",
    description: "Task checkbox",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    insert: () => "- [ ] ",
  },
  {
    name: "quote",
    label: "Quote",
    description: "Block quote",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4v8M7 6h7M7 10h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    insert: () => "> ",
  },
  {
    name: "code",
    label: "Code Block",
    description: "Fenced code block",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 4L1 8l4 4M11 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    insert: () => "```\n\n```",
  },
  {
    name: "table",
    label: "Table",
    description: "3x3 table",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.2"/><line x1="1" y1="6" x2="15" y2="6" stroke="currentColor" stroke-width="1"/><line x1="1" y1="10" x2="15" y2="10" stroke="currentColor" stroke-width="1"/><line x1="6" y1="2" x2="6" y2="14" stroke="currentColor" stroke-width="1"/><line x1="11" y1="2" x2="11" y2="14" stroke="currentColor" stroke-width="1"/></svg>',
    insert: () =>
      "| Header | Header | Header |\n| ------ | ------ | ------ |\n| Cell   | Cell   | Cell   |\n| Cell   | Cell   | Cell   |\n| Cell   | Cell   | Cell   |",
  },
  {
    name: "divider",
    label: "Divider",
    description: "Horizontal rule",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    insert: () => "---",
  },
  {
    name: "link",
    label: "Link",
    description: "Hyperlink",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6.5 9.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5l-1 1M9.5 6.5a3.5 3.5 0 00-5 0l-2 2a3.5 3.5 0 005 5l1-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    insert: () => "[text](url)",
  },
  {
    name: "image",
    label: "Image",
    description: "Embed image",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="6" r="1.5" fill="currentColor"/><path d="M1 11l4-4 3 3 2-2 5 5H3a2 2 0 01-2-2z" fill="currentColor" opacity="0.3"/></svg>',
    insert: () => "![alt](url)",
  },
  {
    name: "date",
    label: "Date",
    description: "Insert today's date",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><line x1="1" y1="7" x2="15" y2="7" stroke="currentColor" stroke-width="1"/><line x1="5" y1="1" x2="5" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="11" y1="1" x2="11" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    insert: () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    },
  },
  {
    name: "time",
    label: "Time",
    description: "Insert current time",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/><path d="M8 4v4l3 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    insert: () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    },
  },
  {
    name: "callout",
    label: "Callout",
    description: "Note callout block",
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/><line x1="8" y1="7" x2="8" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="5" r="0.8" fill="currentColor"/></svg>',
    insert: () => "> [!note]\n> ",
  },
];

// ─── State Management ───

const openSlashMenu = StateEffect.define<{
  from: number;
  filter: string;
} | null>();

interface SlashMenuState {
  open: boolean;
  from: number; // position where `/` was typed
  filter: string;
  selectedIndex: number;
}

const slashMenuField = StateField.define<SlashMenuState>({
  create() {
    return { open: false, from: 0, filter: "", selectedIndex: 0 };
  },
  update(state, tr: Transaction) {
    for (const effect of tr.effects) {
      if (effect.is(openSlashMenu)) {
        if (effect.value === null) {
          return { open: false, from: 0, filter: "", selectedIndex: 0 };
        }
        return {
          open: true,
          from: effect.value.from,
          filter: effect.value.filter,
          selectedIndex: 0,
        };
      }
    }
    // If the document changed, update filter or close
    if (state.open && tr.docChanged) {
      // Map the from position through the changes
      const newFrom = tr.changes.mapPos(state.from, 1);
      const cursorPos = tr.state.selection.main.head;
      // Check if cursor is still after the slash position
      if (cursorPos < newFrom) {
        return { open: false, from: 0, filter: "", selectedIndex: 0 };
      }
      const text = tr.state.doc.sliceString(newFrom, cursorPos);
      // If text contains spaces or newlines, close
      if (/[\s\n]/.test(text)) {
        return { open: false, from: 0, filter: "", selectedIndex: 0 };
      }
      return { ...state, from: newFrom, filter: text, selectedIndex: 0 };
    }
    // Close on selection change that moves away
    if (state.open && tr.selection) {
      const cursorPos = tr.state.selection.main.head;
      if (cursorPos < state.from) {
        return { open: false, from: 0, filter: "", selectedIndex: 0 };
      }
    }
    return state;
  },
});

function getFilteredCommands(filter: string): SlashCommand[] {
  if (!filter) return commands;
  const lower = filter.toLowerCase();
  return commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(lower) ||
      cmd.label.toLowerCase().includes(lower) ||
      cmd.description.toLowerCase().includes(lower)
  );
}

// ─── Dropdown UI ───

class SlashMenuView {
  private dom: HTMLDivElement;
  private list: HTMLDivElement;
  private selectedIndex = 0;
  private filteredCommands: SlashCommand[] = commands;
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;

    this.dom = document.createElement("div");
    this.dom.className = "slash-menu";
    this.dom.style.display = "none";

    this.list = document.createElement("div");
    this.list.className = "slash-menu-list";
    this.dom.appendChild(this.list);

    document.body.appendChild(this.dom);

    this.renderList();
  }

  update(update: ViewUpdate) {
    const state = update.state.field(slashMenuField);
    if (!state.open) {
      this.dom.style.display = "none";
      return;
    }

    this.filteredCommands = getFilteredCommands(state.filter);
    this.selectedIndex = Math.min(
      state.selectedIndex,
      this.filteredCommands.length - 1
    );
    if (this.selectedIndex < 0) this.selectedIndex = 0;

    this.renderList();
    this.positionMenu(update.view, state.from);
    this.dom.style.display = "";
  }

  private positionMenu(view: EditorView, from: number) {
    // Get cursor coordinates from the editor
    const coords = view.coordsAtPos(from);
    if (!coords) {
      this.dom.style.display = "none";
      return;
    }

    const menuHeight = this.dom.offsetHeight || 300;
    const menuWidth = this.dom.offsetWidth || 260;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let top = coords.bottom + 4;
    let left = coords.left;

    // Flip up if not enough space below
    if (top + menuHeight > viewportHeight - 8) {
      top = coords.top - menuHeight - 4;
    }
    // Keep within viewport horizontally
    if (left + menuWidth > viewportWidth - 8) {
      left = viewportWidth - menuWidth - 8;
    }
    if (left < 8) left = 8;

    this.dom.style.top = `${top}px`;
    this.dom.style.left = `${left}px`;
  }

  private renderList() {
    this.list.innerHTML = "";

    if (this.filteredCommands.length === 0) {
      const empty = document.createElement("div");
      empty.className = "slash-menu-empty";
      empty.textContent = "No commands found";
      this.list.appendChild(empty);
      return;
    }

    this.filteredCommands.forEach((cmd, i) => {
      const item = document.createElement("button");
      item.className = `slash-menu-item${i === this.selectedIndex ? " slash-menu-item-active" : ""}`;
      item.type = "button";

      const icon = document.createElement("span");
      icon.className = "slash-menu-icon";
      icon.innerHTML = cmd.icon;

      const textWrap = document.createElement("div");
      textWrap.className = "slash-menu-text";

      const label = document.createElement("span");
      label.className = "slash-menu-label";
      label.textContent = `/${cmd.name}`;

      const desc = document.createElement("span");
      desc.className = "slash-menu-desc";
      desc.textContent = cmd.description;

      textWrap.appendChild(label);
      textWrap.appendChild(desc);

      item.appendChild(icon);
      item.appendChild(textWrap);

      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.executeCommand(i);
      });

      item.addEventListener("mouseenter", () => {
        this.selectedIndex = i;
        this.updateActiveItem();
      });

      this.list.appendChild(item);
    });

    // Scroll active item into view
    const activeItem = this.list.children[this.selectedIndex] as HTMLElement;
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }

  private updateActiveItem() {
    const items = this.list.querySelectorAll(".slash-menu-item");
    items.forEach((item, i) => {
      item.classList.toggle("slash-menu-item-active", i === this.selectedIndex);
    });
  }

  executeCommand(index: number) {
    const cmd = this.filteredCommands[index];
    if (!cmd) return;

    const state = this.view.state.field(slashMenuField);
    if (!state.open) return;

    const insertText = cmd.insert();
    // Replace from the slash character (state.from - 1 to include the /) to cursor
    const from = state.from - 1; // include the `/`
    const to = this.view.state.selection.main.head;

    this.view.dispatch({
      changes: { from, to, insert: insertText },
      effects: openSlashMenu.of(null),
    });

    // For code blocks, place cursor between the fences
    if (cmd.name === "code") {
      const newPos = from + 4; // after "```\n"
      this.view.dispatch({
        selection: { anchor: newPos },
      });
    }

    this.view.focus();
  }

  moveSelection(delta: number) {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex =
      (this.selectedIndex + delta + this.filteredCommands.length) %
      this.filteredCommands.length;
    this.updateActiveItem();

    const activeItem = this.list.children[this.selectedIndex] as HTMLElement;
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }

  confirmSelection() {
    this.executeCommand(this.selectedIndex);
  }

  destroy() {
    this.dom.remove();
  }
}

// ─── Input Handler ───

function slashInputHandler(view: EditorView, from: number, to: number, text: string) {
  if (text !== "/") return false;

  const line = view.state.doc.lineAt(from);
  const textBeforeSlash = view.state.doc.sliceString(line.from, from);

  // Only trigger at start of line or after only whitespace
  if (textBeforeSlash.trim() !== "") return false;

  // Schedule the effect after the character is inserted
  setTimeout(() => {
    view.dispatch({
      effects: openSlashMenu.of({ from: from + 1, filter: "" }),
    });
  }, 0);

  return false; // let the / be inserted normally
}

// ─── Extension ───

export function slashCommands(): Extension {
  const menuPlugin = ViewPlugin.define(
    (view) => new SlashMenuView(view),
    {}
  );

  return [
    slashMenuField,
    menuPlugin,
    EditorView.inputHandler.of(slashInputHandler),
    keymap.of([
      {
        key: "ArrowDown",
        run(view) {
          const state = view.state.field(slashMenuField);
          if (!state.open) return false;
          const plugin = view.plugin(menuPlugin);
          if (plugin) plugin.moveSelection(1);
          return true;
        },
      },
      {
        key: "ArrowUp",
        run(view) {
          const state = view.state.field(slashMenuField);
          if (!state.open) return false;
          const plugin = view.plugin(menuPlugin);
          if (plugin) plugin.moveSelection(-1);
          return true;
        },
      },
      {
        key: "Enter",
        run(view) {
          const state = view.state.field(slashMenuField);
          if (!state.open) return false;
          const plugin = view.plugin(menuPlugin);
          if (plugin) plugin.confirmSelection();
          return true;
        },
      },
      {
        key: "Escape",
        run(view) {
          const state = view.state.field(slashMenuField);
          if (!state.open) return false;
          view.dispatch({ effects: openSlashMenu.of(null) });
          return true;
        },
      },
      {
        key: "Tab",
        run(view) {
          const state = view.state.field(slashMenuField);
          if (!state.open) return false;
          const plugin = view.plugin(menuPlugin);
          if (plugin) plugin.confirmSelection();
          return true;
        },
      },
    ]),
  ];
}
