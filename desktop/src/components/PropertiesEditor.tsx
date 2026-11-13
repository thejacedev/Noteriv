"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PROPERTY_TYPES,
  coerce,
  deleteProperty,
  hasInvalidProperties,
  inferType,
  isBuiltInProperty,
  readProperties,
  renameProperty,
  setProperty,
  summarizeProperties,
  typeOf,
  type PropertyType,
} from "@/lib/properties";
import { loadVaultIndex } from "@/lib/vault-index";
import "../styles/frontmatter.css";

interface PropertiesEditorProps {
  /** The open note's text. */
  content: string;
  onChange: (next: string) => void;
  /** The types the vault has recorded for its properties. */
  types: Record<string, PropertyType>;
  onTypeChange: (name: string, type: PropertyType) => void;
  vaultPath: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Counts up each time the Add Property command runs. */
  addRequest: number;
  /** The add row was closed on a note that has no properties. */
  onDismiss: () => void;
}

const COMMON_NAMES = ["tags", "aliases", "cssclasses", "title", "date", "status", "publish"];

const TYPE_GLYPH: Record<PropertyType, string> = {
  text: "T",
  list: "≡",
  number: "#",
  checkbox: "☑",
  date: "D",
  datetime: "DT",
};

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

/** Whether a value can be shown in the input its type calls for. */
function fits(value: unknown, type: PropertyType): boolean {
  if (isEmpty(value)) return true;
  switch (type) {
    case "list":
      return Array.isArray(value) && value.every((v) => typeof v !== "object" || v === null);
    case "number":
      return typeof value === "number";
    case "checkbox":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && inferType(value) === "date";
    case "datetime":
      return typeof value === "string" && inferType(value) === "datetime";
    default:
      return typeof value !== "object";
  }
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** A text box that keeps what is typed until it is left, then hands it over. */
function CommitInput({
  value,
  onCommit,
  type = "text",
  className = "fm-value-input",
  placeholder = "Empty",
  title,
}: {
  value: string;
  onCommit: (next: string) => void;
  type?: string;
  className?: string;
  placeholder?: string;
  title?: string;
}) {
  // What is being typed, while the box has the cursor. Outside that it shows
  // the note's own value, so an undo or a sync is followed at once.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  return (
    <input
      className={className}
      type={type}
      value={shown}
      placeholder={placeholder}
      title={title}
      spellCheck={false}
      onFocus={() => setDraft(value)}
      onChange={(e) => {
        setDraft(e.target.value);
        // A date picker has no moment of "done typing": take each pick as it comes.
        if (type === "date" || type === "datetime-local") onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        const input = e.target as HTMLInputElement;
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") {
          // Leave without keeping what was typed.
          setDraft(value);
          setTimeout(() => input.blur(), 0);
        }
      }}
    />
  );
}

function ListValue({ items, onCommit }: { items: unknown[]; onCommit: (next: unknown[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    setDraft("");
    if (parts.length > 0) onCommit([...items, ...parts]);
  };
  return (
    <div className="fm-list">
      {items.map((item, i) => (
        <span key={`${i}:${asText(item)}`} className="fm-chip">
          {asText(item)}
          <button
            className="fm-chip-remove"
            title="Remove"
            onClick={() => onCommit(items.filter((_, n) => n !== i))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="fm-list-input"
        value={draft}
        placeholder={items.length === 0 ? "Empty" : ""}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && draft === "" && items.length > 0) {
            onCommit(items.slice(0, -1));
          }
        }}
      />
    </div>
  );
}

/** The properties of the open note, each edited as the kind of value it is. */
export default function PropertiesEditor({
  content,
  onChange,
  types,
  onTypeChange,
  vaultPath,
  collapsed,
  onToggleCollapse,
  addRequest,
  onDismiss,
}: PropertiesEditorProps) {
  const properties = useMemo(() => readProperties(content), [content]);
  const invalid = useMemo(() => hasInvalidProperties(content), [content]);
  const [typeMenu, setTypeMenu] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [vaultNames, setVaultNames] = useState<string[]>([]);
  const newNameRef = useRef<HTMLInputElement>(null);
  const handledRequest = useRef(addRequest);

  useEffect(() => {
    if (addRequest !== handledRequest.current) {
      handledRequest.current = addRequest;
      setAdding(true);
    }
  }, [addRequest]);

  useEffect(() => {
    if (!adding) return;
    newNameRef.current?.focus();
    if (!vaultPath) return;
    let cancelled = false;
    loadVaultIndex(vaultPath).then((notes) => {
      if (!cancelled) setVaultNames(summarizeProperties(notes, {}).map((p) => p.name));
    });
    return () => {
      cancelled = true;
    };
  }, [adding, vaultPath]);

  // The type menu closes on a click anywhere else.
  useEffect(() => {
    if (typeMenu === null) return;
    const close = () => setTypeMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [typeMenu]);

  const existing = new Set(properties.map((p) => p.key));
  const suggestions = [...new Set([...vaultNames, ...COMMON_NAMES])]
    .filter((name) => !existing.has(name) && name.toLowerCase().includes(newName.trim().toLowerCase()))
    .slice(0, 8);

  const stopAdding = () => {
    setAdding(false);
    setNewName("");
    if (properties.length === 0) onDismiss();
  };

  const addProperty = (raw: string) => {
    const name = raw.trim();
    if (!name || existing.has(name)) return;
    const type = typeOf(name, null, types);
    const start: unknown = type === "list" ? [] : type === "checkbox" ? false : null;
    onChange(setProperty(content, name, start));
    setAdding(false);
    setNewName("");
  };

  const changeType = (key: string, value: unknown, type: PropertyType) => {
    setTypeMenu(null);
    onTypeChange(key, type);
    const next = coerce(value, type);
    // A value that cannot become the new type stays as it is, marked, rather than being thrown away.
    if (next === null && !isEmpty(value)) return;
    if (JSON.stringify(next) !== JSON.stringify(value)) onChange(setProperty(content, key, next));
  };

  if (invalid) {
    return (
      <div className="fm-editor">
        <div className="fm-invalid">
          The properties at the top of this note are not valid YAML, so they are shown as text. Fix them in the note.
        </div>
      </div>
    );
  }

  return (
    <div className="fm-editor">
      <div className="fm-header" onClick={onToggleCollapse}>
        <svg width="10" height="10" viewBox="0 0 10 10" className={`fm-chevron ${collapsed ? "" : "fm-chevron-open"}`}>
          <path d="M3.5 2L7 5L3.5 8" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="fm-header-label">Properties</span>
        <span className="fm-header-count">{properties.length}</span>
      </div>

      {!collapsed && (
        <div className="fm-body">
          {properties.map(({ key, value }) => {
            const type = typeOf(key, value, types);
            const fixed = isBuiltInProperty(key);
            const ok = fits(value, type);
            return (
              <div key={key} className="fm-property">
                <div className="fm-type-wrap">
                  <button
                    className="fm-type-btn"
                    title={
                      fixed
                        ? `${PROPERTY_TYPES.find((t) => t.value === type)?.label}: this property is always a list`
                        : `${PROPERTY_TYPES.find((t) => t.value === type)?.label}. Click to change the type`
                    }
                    disabled={fixed}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTypeMenu(typeMenu === key ? null : key);
                    }}
                  >
                    {TYPE_GLYPH[type]}
                  </button>
                  {typeMenu === key && (
                    <div className="fm-type-menu" onClick={(e) => e.stopPropagation()}>
                      {PROPERTY_TYPES.map((t) => (
                        <button
                          key={t.value}
                          className={`fm-type-item${t.value === type ? " fm-type-item-active" : ""}`}
                          onClick={() => changeType(key, value, t.value)}
                        >
                          <span className="fm-type-glyph">{TYPE_GLYPH[t.value]}</span>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <CommitInput
                  className="fm-key-input"
                  value={key}
                  placeholder="Name"
                  title="Property name"
                  onCommit={(next) => onChange(renameProperty(content, key, next))}
                />
                <div className="fm-property-value-wrap">
                  {!ok ? (
                    typeof value === "object" && value !== null && !Array.isArray(value) ? (
                      <span className="fm-nested" title="A property with properties of its own. Edit it in the note.">
                        {asText(value)}
                      </span>
                    ) : (
                      <CommitInput
                        className="fm-value-input fm-mismatch"
                        value={Array.isArray(value) ? value.map(asText).join(", ") : asText(value)}
                        title={`This value is not a ${PROPERTY_TYPES.find((t) => t.value === type)?.label.toLowerCase()}`}
                        onCommit={(next) => {
                          const fitted = coerce(next, type);
                          onChange(setProperty(content, key, fitted === null && next.trim() !== "" ? next : fitted));
                        }}
                      />
                    )
                  ) : type === "list" ? (
                    <ListValue
                      items={Array.isArray(value) ? value : []}
                      onCommit={(next) => onChange(setProperty(content, key, next))}
                    />
                  ) : type === "checkbox" ? (
                    <input
                      type="checkbox"
                      className="fm-checkbox"
                      checked={value === true}
                      onChange={(e) => onChange(setProperty(content, key, e.target.checked))}
                    />
                  ) : type === "number" ? (
                    <CommitInput
                      type="number"
                      value={asText(value)}
                      onCommit={(next) => onChange(setProperty(content, key, next.trim() === "" ? null : coerce(next, "number")))}
                    />
                  ) : type === "date" ? (
                    <CommitInput
                      type="date"
                      value={asText(value)}
                      onCommit={(next) => onChange(setProperty(content, key, next || null))}
                    />
                  ) : type === "datetime" ? (
                    <CommitInput
                      type="datetime-local"
                      value={asText(value).replace(" ", "T")}
                      onCommit={(next) => onChange(setProperty(content, key, next || null))}
                    />
                  ) : (
                    <CommitInput value={asText(value)} onCommit={(next) => onChange(setProperty(content, key, next === "" ? null : next))} />
                  )}
                </div>
                <button className="fm-delete-btn" onClick={() => onChange(deleteProperty(content, key))} title="Remove property">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            );
          })}

          {adding ? (
            <div className="fm-add-row">
              <input
                ref={newNameRef}
                className="fm-new-key-input"
                placeholder="Property name"
                value={newName}
                spellCheck={false}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) addProperty(newName);
                  if (e.key === "Escape") stopAdding();
                }}
                // The delay lets a click on a suggestion land first.
                onBlur={() => setTimeout(() => setAdding((still) => (still && !newNameRef.current?.matches(":focus") ? (stopAdding(), false) : still)), 150)}
              />
              {suggestions.length > 0 && (
                <div className="fm-suggestions">
                  {suggestions.map((name) => (
                    <button
                      key={name}
                      className="fm-suggestion-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addProperty(name);
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button className="fm-add-btn" onClick={() => setAdding(true)}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Add property
            </button>
          )}
        </div>
      )}
    </div>
  );
}
