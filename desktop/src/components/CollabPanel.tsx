"use client";

import { useState, useCallback } from "react";
import {
  generateRoomId,
  getCollabUserName,
  setCollabUserName,
  startCollab,
  type CollabSession,
} from "@/lib/collab";

interface CollabPanelProps {
  content: string;
  onContentChange: (content: string) => void;
  onClose: () => void;
}

export default function CollabPanel({ content, onContentChange, onClose }: CollabPanelProps) {
  const [roomId, setRoomId] = useState(generateRoomId());
  const [userName, setUserName] = useState(getCollabUserName());
  const [session, setSession] = useState<CollabSession | null>(null);
  const [peers, setPeers] = useState(0);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [joinId, setJoinId] = useState("");

  const handleStart = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setCollabUserName(userName);

    const sess = await startCollab(
      roomId,
      content,
      (updated) => onContentChange(updated),
      (count) => setPeers(count),
    );

    if (sess) {
      setSession(sess);
      setStatus("connected");
    } else {
      setStatus("error");
      setError("Could not start collaboration. Install yjs and y-webrtc: npm install yjs y-webrtc");
    }
  }, [roomId, content, userName, onContentChange]);

  const handleJoin = useCallback(async () => {
    if (!joinId.trim()) return;
    setRoomId(joinId.trim());
    setStatus("connecting");
    setError(null);
    setCollabUserName(userName);

    const sess = await startCollab(
      joinId.trim(),
      "",
      (updated) => onContentChange(updated),
      (count) => setPeers(count),
    );

    if (sess) {
      setSession(sess);
      setStatus("connected");
    } else {
      setStatus("error");
      setError("Could not join session. Install yjs and y-webrtc: npm install yjs y-webrtc");
    }
  }, [joinId, userName, onContentChange]);

  const handleDisconnect = useCallback(() => {
    session?.destroy();
    setSession(null);
    setStatus("idle");
    setPeers(0);
  }, [session]);

  const handleCopyRoom = useCallback(() => {
    navigator.clipboard.writeText(roomId);
  }, [roomId]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 90,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#1e1e2e", borderRadius: 12, border: "1px solid #313244",
        width: 420, padding: 20,
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ color: "#cdd6f4", fontSize: 15, fontWeight: 600 }}>Live Collaboration</span>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: "#585b70", fontSize: 18, cursor: "pointer" }}>&times;</button>
        </div>

        {status === "connected" ? (
          <>
            <div style={{ background: "#313244", borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#a6e3a1" }} />
                <span style={{ color: "#a6e3a1", fontSize: 12, fontWeight: 600 }}>Connected</span>
                <span style={{ color: "#a6adc8", fontSize: 11, marginLeft: "auto" }}>{peers} peer{peers !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#a6adc8", fontSize: 11 }}>Room:</span>
                <code style={{ color: "#89b4fa", fontSize: 12, background: "#1e1e2e", padding: "2px 6px", borderRadius: 4, flex: 1 }}>{roomId}</code>
                <button onClick={handleCopyRoom} style={{
                  border: "1px solid #45475a", background: "transparent", color: "#a6adc8",
                  fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                }}>Copy</button>
              </div>
            </div>
            <p style={{ color: "#a6adc8", fontSize: 11, marginBottom: 12 }}>
              Share the room ID with others. They can join from the command palette &rarr; &quot;Join Collaboration&quot;.
            </p>
            <button onClick={handleDisconnect} style={{
              width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #f38ba8",
              background: "transparent", color: "#f38ba8", fontSize: 12, cursor: "pointer",
            }}>Disconnect</button>
          </>
        ) : (
          <>
            {/* User name */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: "#a6adc8", fontSize: 11, display: "block", marginBottom: 4 }}>Your name</label>
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                style={{
                  width: "100%", background: "#313244", border: "1px solid #45475a",
                  borderRadius: 6, padding: "6px 10px", color: "#cdd6f4", fontSize: 13, outline: "none",
                }}
              />
            </div>

            {/* Start new session */}
            <div style={{ background: "#313244", borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ color: "#cdd6f4", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Start a new session</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <code style={{ color: "#89b4fa", fontSize: 12, background: "#1e1e2e", padding: "2px 6px", borderRadius: 4, flex: 1 }}>{roomId}</code>
                <button onClick={handleCopyRoom} style={{
                  border: "1px solid #45475a", background: "transparent", color: "#a6adc8",
                  fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                }}>Copy</button>
              </div>
              <button onClick={handleStart} disabled={status === "connecting"} style={{
                width: "100%", padding: "8px", borderRadius: 6, border: "none",
                background: "#89b4fa", color: "#1e1e2e", fontSize: 12, fontWeight: 600,
                cursor: status === "connecting" ? "wait" : "pointer",
                opacity: status === "connecting" ? 0.6 : 1,
              }}>
                {status === "connecting" ? "Connecting..." : "Start Session"}
              </button>
            </div>

            {/* Join existing session */}
            <div style={{ background: "#313244", borderRadius: 8, padding: 12 }}>
              <div style={{ color: "#cdd6f4", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Join a session</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  placeholder="Enter room ID..."
                  style={{
                    flex: 1, background: "#1e1e2e", border: "1px solid #45475a",
                    borderRadius: 6, padding: "6px 10px", color: "#cdd6f4", fontSize: 12, outline: "none",
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                />
                <button onClick={handleJoin} disabled={status === "connecting"} style={{
                  padding: "6px 16px", borderRadius: 6, border: "none",
                  background: "#a6e3a1", color: "#1e1e2e", fontSize: 12, fontWeight: 600,
                  cursor: status === "connecting" ? "wait" : "pointer",
                }}>Join</button>
              </div>
            </div>

            {error && (
              <div style={{ color: "#f38ba8", fontSize: 11, marginTop: 8, padding: "8px", background: "#f38ba811", borderRadius: 6 }}>
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
