/**
 * Live Collaboration via WebRTC using Yjs CRDT.
 *
 * Peer-to-peer collaboration — no server required.
 * Uses a simple signaling mechanism via a shared room ID.
 *
 * Dependencies: yjs, y-webrtc (must be installed)
 */

export interface CollabSession {
  roomId: string;
  connected: boolean;
  peers: number;
  destroy: () => void;
}

export interface CollabUser {
  name: string;
  color: string;
}

const COLLAB_COLORS = [
  "#89b4fa", "#a6e3a1", "#f9e2af", "#f38ba8", "#cba6f7",
  "#fab387", "#94e2d5", "#f5c2e7", "#89dceb", "#b4befe",
];

/** Generate a random room ID */
export function generateRoomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `noteriv-${id}`;
}

/** Get a random color for the user cursor */
export function getCollabColor(): string {
  return COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];
}

/** Get or create a persistent user name for collaboration */
export function getCollabUserName(): string {
  if (typeof localStorage === "undefined") return "Anonymous";
  let name = localStorage.getItem("noteriv-collab-name");
  if (!name) {
    name = `User-${Math.floor(Math.random() * 9999)}`;
    localStorage.setItem("noteriv-collab-name", name);
  }
  return name;
}

/** Set the collaboration user name */
export function setCollabUserName(name: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("noteriv-collab-name", name);
  }
}

/**
 * Start a collaboration session.
 * Returns null if yjs/y-webrtc are not installed.
 *
 * Usage:
 *   const session = await startCollab(roomId, content, onChange);
 *   // session.destroy() to leave
 */
export async function startCollab(
  roomId: string,
  initialContent: string,
  onUpdate: (content: string) => void,
  onPeersChange: (count: number) => void,
): Promise<CollabSession | null> {
  try {
    // @ts-ignore — optional dependency, may not be installed
    const Y = await import("yjs");
    // @ts-ignore — optional dependency, may not be installed
    const { WebrtcProvider } = await import("y-webrtc");

    const doc = new Y.Doc();
    const ytext = doc.getText("content");

    // Set initial content if we're the first peer
    if (ytext.length === 0 && initialContent) {
      ytext.insert(0, initialContent);
    }

    const provider = new WebrtcProvider(roomId, doc, {
      signaling: ["wss://signaling.yjs.dev"],
    });

    // Track changes
    ytext.observe(() => {
      onUpdate(ytext.toString());
    });

    // Track peers
    const awareness = provider.awareness;
    const userName = getCollabUserName();
    const userColor = getCollabColor();

    awareness.setLocalStateField("user", { name: userName, color: userColor });
    awareness.on("change", () => {
      const states = Array.from(awareness.getStates().values());
      onPeersChange(states.length);
    });

    const session: CollabSession = {
      roomId,
      connected: true,
      peers: 1,
      destroy() {
        provider.disconnect();
        provider.destroy();
        doc.destroy();
        session.connected = false;
      },
    };

    return session;
  } catch {
    // yjs or y-webrtc not installed
    return null;
  }
}

/**
 * Apply a local edit to the Yjs document.
 * Call this when the user types in the editor.
 */
export function applyLocalEdit(
  doc: unknown,
  from: number,
  to: number,
  insert: string
): void {
  try {
    const Y = (doc as any);
    const ytext = Y.getText("content");
    if (from < to) {
      ytext.delete(from, to - from);
    }
    if (insert) {
      ytext.insert(from, insert);
    }
  } catch {}
}
