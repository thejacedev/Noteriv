"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  parseFrontmatter,
  updateFrontmatter,
  hasFrontmatter,
} from "../lib/frontmatter-utils";
import "../styles/frontmatter.css";

interface FrontmatterEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const COMMON_PROPERTIES = [
  "title",
  "date",
  "tags",
  "aliases",
  "cssclass",
  "publish",
];

export default function FrontmatterEditor({
  content,
  onChange,
  collapsed,
  onToggleCollapse,
}: FrontmatterEditorProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newKeyInputRef = useRef<HTMLInputElement>(null);

  const parsed = parseFrontmatter(content);
  const properties = parsed ? { ...parsed.properties } : {};
  const has = hasFrontmatter(content);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingKey && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingKey]);

  // Focus new key input when adding
  useEffect(() => {
    if (addingNew && newKeyInputRef.current) {
      newKeyInputRef.current.focus();
    }
  }, [addingNew]);

  const commitProperties = useCallback(
    (props: Record<string, string>) => {
      // Remove empty keys
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(props)) {
        if (k.trim()) cleaned[k.trim()] = v;
      }
      const newContent = updateFrontmatter(content, cleaned);
      onChange(newContent);
    },
    [content, onChange]
  );

  const handleStartEdit = useCallback((key: string, value: string) => {
    setEditingKey(key);
    setEditValue(value);
  }, []);

  const handleCommitEdit = useCallback(() => {
    if (editingKey === null) return;
    const newProps = { ...properties, [editingKey]: editValue };
    commitProperties(newProps);
    setEditingKey(null);
    setEditValue("");
  }, [editingKey, editValue, properties, commitProperties]);

  const handleCancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditValue("");
  }, []);

  const handleDeleteProperty = useCallback(
    (key: string) => {
      const newProps = { ...properties };
      delete newProps[key];
      commitProperties(newProps);
    },
    [properties, commitProperties]
  );

  const handleAddProperty = useCallback(
    (key: string) => {
      const trimmedKey = key.trim();
      if (!trimmedKey || properties[trimmedKey] !== undefined) return;

      let defaultValue = "";
      if (trimmedKey === "date") {
        defaultValue = new Date().toISOString().split("T")[0];
      } else if (trimmedKey === "tags") {
        defaultValue = "";
      } else if (trimmedKey === "publish") {
        defaultValue = "false";
      }

      const newProps = { ...properties, [trimmedKey]: defaultValue };
      commitProperties(newProps);
      setAddingNew(false);
      setNewKeyValue("");
      setShowSuggestions(false);

      // Start editing the new property value
      setTimeout(() => handleStartEdit(trimmedKey, defaultValue), 50);
    },
    [properties, commitProperties, handleStartEdit]
  );

  const handleCreateFrontmatter = useCallback(() => {
    const newContent = updateFrontmatter(content, {});
    onChange(newContent);
  }, [content, onChange]);

  // If no frontmatter, show the "Add properties" button
  if (!has) {
    return (
      <div className="fm-editor">
        <button
          className="fm-add-frontmatter-btn"
          onClick={handleCreateFrontmatter}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          Add properties
        </button>
      </div>
    );
  }

  const existingKeys = Object.keys(properties);
  const suggestedKeys = COMMON_PROPERTIES.filter(
    (k) => !existingKeys.includes(k) && k.includes(newKeyValue.toLowerCase())
  );

  return (
    <div className="fm-editor">
      {/* Header */}
      <div className="fm-header" onClick={onToggleCollapse}>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`fm-chevron ${collapsed ? "" : "fm-chevron-open"}`}
        >
          <path
            d="M3.5 2L7 5L3.5 8"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="fm-header-label">Properties</span>
        <span className="fm-header-count">{existingKeys.length}</span>
      </div>

      {/* Properties list */}
      {!collapsed && (
        <div className="fm-body">
          {existingKeys.length === 0 && !addingNew && (
            <div className="fm-empty">No properties defined</div>
          )}

          {existingKeys.map((key) => (
            <div key={key} className="fm-property">
              <span className="fm-property-key" title={key}>
                {key}
              </span>
              <div className="fm-property-value-wrap">
                {editingKey === key ? (
                  <input
                    ref={editInputRef}
                    className="fm-property-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCommitEdit();
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                    onBlur={handleCommitEdit}
                  />
                ) : (
                  <span
                    className="fm-property-value"
                    onClick={() => handleStartEdit(key, properties[key])}
                    title="Click to edit"
                  >
                    {properties[key] || (
                      <span className="fm-placeholder">empty</span>
                    )}
                  </span>
                )}
              </div>
              <button
                className="fm-delete-btn"
                onClick={() => handleDeleteProperty(key)}
                title="Remove property"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}

          {/* Add new property */}
          {addingNew ? (
            <div className="fm-add-row">
              <input
                ref={newKeyInputRef}
                className="fm-new-key-input"
                placeholder="Property name..."
                value={newKeyValue}
                onChange={(e) => {
                  setNewKeyValue(e.target.value);
                  setShowSuggestions(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newKeyValue.trim()) {
                    handleAddProperty(newKeyValue);
                  }
                  if (e.key === "Escape") {
                    setAddingNew(false);
                    setNewKeyValue("");
                    setShowSuggestions(false);
                  }
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  // Delay to allow click on suggestion
                  setTimeout(() => {
                    setShowSuggestions(false);
                    if (!newKeyValue.trim()) setAddingNew(false);
                  }, 150);
                }}
              />
              {showSuggestions && suggestedKeys.length > 0 && (
                <div className="fm-suggestions">
                  {suggestedKeys.map((key) => (
                    <button
                      key={key}
                      className="fm-suggestion-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleAddProperty(key);
                      }}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              className="fm-add-btn"
              onClick={() => setAddingNew(true)}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              Add property
            </button>
          )}
        </div>
      )}
    </div>
  );
}
