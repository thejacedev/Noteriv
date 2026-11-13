"use client";

import { useEffect, useState } from "react";
import {
  PROPERTY_TYPES,
  isBuiltInProperty,
  summarizeProperties,
  type PropertySummary,
  type PropertyType,
} from "@/lib/properties";
import { invalidateVaultIndex, loadVaultIndex } from "@/lib/vault-index";
import "../styles/frontmatter.css";

interface AllPropertiesPanelProps {
  vaultPath: string;
  types: Record<string, PropertyType>;
  onTypeChange: (name: string, type: PropertyType) => void;
  /** Opens the search panel on a query. */
  onSearch: (query: string) => void;
  onClose: () => void;
}

/** Every property used in the vault: its type and how many notes have it. */
export default function AllPropertiesPanel({ vaultPath, types, onTypeChange, onSearch, onClose }: AllPropertiesPanelProps) {
  const [notes, setNotes] = useState<{ properties: Record<string, unknown> }[] | null>(null);
  const [byCount, setByCount] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadVaultIndex(vaultPath).then((index) => {
      if (!cancelled) setNotes(index);
    });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, reload]);

  const summary: PropertySummary[] = notes ? summarizeProperties(notes, types) : [];
  if (byCount) summary.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return (
    <div className="bl-panel">
      <div className="bl-header">
        <span className="bl-title">All properties</span>
        <div className="bl-header-right">
          <span className="bl-count">{summary.length}</span>
          <button onClick={onClose} className="bl-close" title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="ap-tools">
        <button
          className="bl-action"
          title={byCount ? "Sorted by how many notes use each. Click to sort by name" : "Sorted by name. Click to sort by use"}
          onClick={() => setByCount((c) => !c)}
        >
          {byCount ? "Sorted by use" : "Sorted by name"}
        </button>
        <button
          className="bl-action"
          title="Read the vault again"
          onClick={() => {
            invalidateVaultIndex();
            setReload((n) => n + 1);
          }}
        >
          Refresh
        </button>
      </div>
      <div className="bl-list">
        {notes === null ? (
          <div className="bl-empty">Reading the vault…</div>
        ) : summary.length === 0 ? (
          <div className="bl-empty">
            No note in this vault has properties yet. Add some with the Add Property command, or write them between two
            lines of --- at the top of a note.
          </div>
        ) : (
          summary.map((property) => (
            <div key={property.name} className="bl-row ap-row">
              <select
                className="ap-type"
                value={property.type}
                disabled={isBuiltInProperty(property.name)}
                title={isBuiltInProperty(property.name) ? "This property is always a list" : "The type of this property in every note"}
                onChange={(e) => onTypeChange(property.name, e.target.value as PropertyType)}
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                className="bl-snippet ap-name"
                title={`Search for notes that have ${property.name}`}
                onClick={() => onSearch(`[${property.name}]`)}
              >
                <span className="bl-snippet-text">{property.name}</span>
                <span className="bl-line-num">{property.count}</span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
