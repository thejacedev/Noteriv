import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { carriesFiles, pageTakesOutsideDrops, refuseStrayDrops, startedInApp, strayDrag } from "../outside-drops";

describe("where the page is handed outside drags", () => {
  it("is Windows only", () => {
    expect(pageTakesOutsideDrops("win32")).toBe(true);
    expect(pageTakesOutsideDrops("linux")).toBe(false);
    expect(pageTakesOutsideDrops("darwin")).toBe(false);
    expect(pageTakesOutsideDrops("unknown")).toBe(false);
    expect(pageTakesOutsideDrops("")).toBe(false);
  });
});

describe("what a drag carries", () => {
  it("knows files from text", () => {
    expect(carriesFiles({ types: ["Files"] })).toBe(true);
    expect(carriesFiles({ types: ["text/plain", "Files"] })).toBe(true);
    expect(carriesFiles({ types: ["text/plain"] })).toBe(false);
    expect(carriesFiles({ types: ["text/uri-list", "text/html"] })).toBe(false);
    expect(carriesFiles({ types: [] })).toBe(false);
    expect(carriesFiles(null)).toBe(false);
    expect(carriesFiles(undefined)).toBe(false);
  });

  it("knows a drag that started in the app by its mark", () => {
    expect(startedInApp({ types: ["text/uri-list", "text/html", "Files", "application/x-noteriv-drag"] })).toBe(true);
    expect(startedInApp({ types: ["Files"] })).toBe(false);
    expect(startedInApp({ types: ["text/plain"] })).toBe(false);
    expect(startedInApp(null)).toBe(false);
  });
});

describe("a drag nothing took", () => {
  it("is left alone once something in the page has taken it", () => {
    expect(strayDrag(true, true, false)).toBe("leave");
    expect(strayDrag(true, false, false)).toBe("leave");
    expect(strayDrag(true, true, true)).toBe("leave");
  });

  it("is refused when it carries files, over a field too", () => {
    expect(strayDrag(false, true, false)).toBe("refuse");
    expect(strayDrag(false, true, true)).toBe("refuse");
  });

  it("is left to be typed in when it is text over a field or an editor", () => {
    expect(strayDrag(false, false, true)).toBe("leave");
  });

  it("is refused when it is text over anything else, since a link is text too", () => {
    expect(strayDrag(false, false, false)).toBe("refuse");
  });
});

// Just enough of the page for the listeners: the kinds of element they ask
// about, a window that keeps its listeners, and events that remember what
// was done to them.
class FakeNode {}
class FakeElement extends FakeNode {
  constructor(private field = false) { super(); }
  closest(selector: string) { return this.field && selector.includes("input") ? this : null; }
}
class FakeHTMLElement extends FakeElement {
  constructor(field = false, public isContentEditable = false) { super(field); }
}

type Handler = (event: FakeEvent) => void;
interface FakeEvent {
  defaultPrevented: boolean;
  dataTransfer: { types: string[]; dropEffect: string; setData: (type: string, value: string) => void };
  target: unknown;
  preventDefault: () => void;
}

function fakeWindow() {
  const handlers = new Map<string, Set<Handler>>();
  return {
    addEventListener(type: string, handler: Handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(handler);
    },
    removeEventListener(type: string, handler: Handler) {
      handlers.get(type)?.delete(handler);
    },
    send(type: string, event: FakeEvent) {
      handlers.get(type)?.forEach((handler) => handler(event));
      return event;
    },
    count() {
      return Array.from(handlers.values()).reduce((sum, set) => sum + set.size, 0);
    },
  };
}

function drag(types: string[], target: unknown, taken = false): FakeEvent {
  const event: FakeEvent = {
    defaultPrevented: taken,
    dataTransfer: { types, dropEffect: "copy", setData: (type: string) => { types.push(type); } },
    target,
    preventDefault() { event.defaultPrevented = true; },
  };
  return event;
}

describe("refusing stray drops", () => {
  beforeEach(() => {
    vi.stubGlobal("Node", FakeNode);
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("HTMLElement", FakeHTMLElement);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const plain = () => new FakeHTMLElement();
  const field = () => new FakeHTMLElement(true);
  const editor = () => new FakeHTMLElement(false, true);

  it("refuses a file over a part of the page that takes nothing", () => {
    const page = fakeWindow();
    refuseStrayDrops(page as unknown as Window);
    for (const type of ["dragenter", "dragover"]) {
      const event = page.send(type, drag(["Files"], plain()));
      expect(event.defaultPrevented).toBe(true);
      expect(event.dataTransfer.dropEffect).toBe("none");
    }
    expect(page.send("drop", drag(["Files"], plain())).defaultPrevented).toBe(true);
  });

  it("refuses a file over a field, which would otherwise open it", () => {
    const page = fakeWindow();
    refuseStrayDrops(page as unknown as Window);
    const event = page.send("dragover", drag(["Files"], field()));
    expect(event.defaultPrevented).toBe(true);
    expect(event.dataTransfer.dropEffect).toBe("none");
  });

  it("leaves a drag that something in the page took", () => {
    const page = fakeWindow();
    refuseStrayDrops(page as unknown as Window);
    const event = page.send("dragover", drag(["Files"], plain(), true));
    expect(event.dataTransfer.dropEffect).toBe("copy");
  });

  it("leaves text over a field or an editor to be typed in", () => {
    const page = fakeWindow();
    refuseStrayDrops(page as unknown as Window);
    for (const target of [field(), editor()]) {
      const over = page.send("dragover", drag(["text/plain"], target));
      expect(over.defaultPrevented).toBe(false);
      expect(over.dataTransfer.dropEffect).toBe("copy");
      expect(page.send("drop", drag(["text/plain"], target)).defaultPrevented).toBe(false);
    }
  });

  it("refuses text and links anywhere else", () => {
    const page = fakeWindow();
    refuseStrayDrops(page as unknown as Window);
    const event = page.send("dragover", drag(["text/uri-list", "text/plain"], plain()));
    expect(event.defaultPrevented).toBe(true);
    expect(event.dataTransfer.dropEffect).toBe("none");
  });

  it("marks a drag that starts in the window, and only that", () => {
    const page = fakeWindow();
    refuseStrayDrops(page as unknown as Window);
    // A picture shown on the page: the browser says it carries a file.
    const own = page.send("dragstart", drag(["text/uri-list", "text/html", "Files"], plain()));
    expect(startedInApp(own.dataTransfer)).toBe(true);
    expect(own.defaultPrevented).toBe(false);
    // A file from outside never starts in the window.
    expect(startedInApp(page.send("dragover", drag(["Files"], plain())).dataTransfer)).toBe(false);
  });

  it("stops when told to", () => {
    const page = fakeWindow();
    const stop = refuseStrayDrops(page as unknown as Window);
    expect(page.count()).toBe(4);
    stop();
    expect(page.count()).toBe(0);
    expect(page.send("dragover", drag(["Files"], plain())).defaultPrevented).toBe(false);
    expect(startedInApp(page.send("dragstart", drag(["Files"], plain())).dataTransfer)).toBe(false);
  });
});
