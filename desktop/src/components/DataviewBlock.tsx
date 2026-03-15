"use client";

import { useState, useEffect, useMemo } from "react";
import { parseQuery, executeQuery, parseNoteData, type QueryResult, type NoteData } from "@/lib/dataview";

interface DataviewBlockProps {
  query: string;
  vaultPath: string;
  onFileSelect?: (filePath: string) => void;
}

export default function DataviewBlock({ query, vaultPath, onFileSelect }: DataviewBlockProps) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseQuery(query), [query]);

  useEffect(() => {
    async function run() {
      if ("error" in parsed) {
        setError(parsed.error);
        setLoading(false);
        return;
      }

      if (!window.electronAPI) {
        setError("Electron API not available");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const files = await window.electronAPI.listAllFiles(vaultPath);
        const notes: NoteData[] = [];

        for (const file of files) {
          if (!file.filePath.match(/\.(md|markdown)$/i)) continue;
          const content = await window.electronAPI.readFile(file.filePath);
          if (content === null) continue;

          const note = parseNoteData(file.filePath, content, {
            created: "",
            modified: "",
            size: content.length,
          });
          notes.push(note);
        }

        const result = executeQuery(parsed, notes);
        setResult(result);
        setError(null);
      } catch (err) {
        setError(String(err));
      }
      setLoading(false);
    }
    run();
  }, [parsed, vaultPath]);

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#a6adc8", fontSize: 12 }}>
          <div style={{
            width: 12, height: 12, border: "2px solid #89b4fa", borderTopColor: "transparent",
            borderRadius: "50%", animation: "spin 1s linear infinite",
          }} />
          Running query...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...containerStyle, borderColor: "#f38ba8" }}>
        <div style={{ color: "#f38ba8", fontSize: 12 }}>Dataview Error: {error}</div>
        <pre style={{ color: "#a6adc8", fontSize: 11, marginTop: 4, opacity: 0.7 }}>{query}</pre>
      </div>
    );
  }

  if (!result) return null;

  // TABLE view
  if (result.type === "TABLE") {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>TABLE</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {result.fields.map((f) => (
                <th key={f} style={thStyle}>{f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} style={{ borderTop: "1px solid #313244" }}>
                {result.fields.map((f) => (
                  <td key={f} style={tdStyle}>
                    {f === "file.name" ? (
                      <button
                        onClick={() => onFileSelect?.(row["file.path"])}
                        style={linkStyle}
                      >{row[f]}</button>
                    ) : (
                      row[f] || ""
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr><td colSpan={result.fields.length} style={{ ...tdStyle, color: "#585b70", textAlign: "center" }}>No results</td></tr>
            )}
          </tbody>
        </table>
        <div style={footerStyle}>{result.rows.length} results</div>
      </div>
    );
  }

  // LIST view
  if (result.type === "LIST") {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>LIST</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {result.rows.map((row, i) => (
            <li key={i} style={{ padding: "3px 0" }}>
              <button
                onClick={() => onFileSelect?.(row["file.path"])}
                style={linkStyle}
              >{row["file.name"]}</button>
            </li>
          ))}
          {result.rows.length === 0 && (
            <li style={{ color: "#585b70", fontSize: 12 }}>No results</li>
          )}
        </ul>
        <div style={footerStyle}>{result.rows.length} results</div>
      </div>
    );
  }

  // TASK view
  if (result.type === "TASK" && result.tasks) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>TASK</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {result.tasks.map((task, i) => (
            <li key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 6, padding: "3px 0",
              color: task.completed ? "#585b70" : "#cdd6f4", fontSize: 12,
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0, marginTop: 1,
                border: task.completed ? "none" : "1.5px solid #585b70",
                background: task.completed ? "#a6e3a1" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#1e1e2e", fontSize: 9,
              }}>{task.completed ? "\u2713" : ""}</span>
              <span style={{ textDecoration: task.completed ? "line-through" : "none" }}>{task.text}</span>
              <button
                onClick={() => onFileSelect?.(task.filePath)}
                style={{ ...linkStyle, fontSize: 10, opacity: 0.6, marginLeft: "auto" }}
              >{task.fileName}</button>
            </li>
          ))}
          {result.tasks.length === 0 && (
            <li style={{ color: "#585b70", fontSize: 12 }}>No tasks found</li>
          )}
        </ul>
        <div style={footerStyle}>{result.tasks.length} tasks</div>
      </div>
    );
  }

  return null;
}

const containerStyle: React.CSSProperties = {
  background: "#313244",
  border: "1px solid #45475a",
  borderRadius: 8,
  padding: 12,
  margin: "8px 0",
};

const headerStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#89b4fa",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  marginBottom: 8,
};

const footerStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#585b70",
  marginTop: 8,
  textAlign: "right" as const,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  color: "#a6adc8",
  fontSize: 11,
  fontWeight: 600,
  borderBottom: "1px solid #45475a",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  color: "#cdd6f4",
  fontSize: 12,
};

const linkStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#89b4fa",
  fontSize: 12,
  cursor: "pointer",
  padding: 0,
  textDecoration: "none",
};
