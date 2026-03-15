"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getAllTags } from "@/lib/tag-utils";

interface TagPaneProps {
  vaultPath: string;
  onTagClick: (tag: string) => void;
  onFileSelect: (filePath: string) => void;
  visible: boolean;
}

interface TagInfo {
  tag: string;
  count: number;
  files: string[];
}

/**
 * A tree node for nested tags.
 * e.g. #project/alpha/beta becomes:
 *   project (segment) -> alpha (segment) -> beta (segment)
 */
interface TagTreeNode {
  segment: string;
  fullTag: string | null; // non-null if this node represents an actual tag
  count: number;
  files: string[];
  children: Map<string, TagTreeNode>;
}

function buildTagTree(tags: TagInfo[]): Map<string, TagTreeNode> {
  const root = new Map<string, TagTreeNode>();

  for (const tagInfo of tags) {
    // Remove the leading #
    const rawTag = tagInfo.tag.startsWith("#")
      ? tagInfo.tag.slice(1)
      : tagInfo.tag;
    const segments = rawTag.split("/");
    let currentLevel = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;

      if (!currentLevel.has(segment)) {
        currentLevel.set(segment, {
          segment,
          fullTag: null,
          count: 0,
          files: [],
          children: new Map(),
        });
      }

      const node = currentLevel.get(segment)!;

      if (isLast) {
        node.fullTag = tagInfo.tag;
        node.count = tagInfo.count;
        node.files = tagInfo.files;
      }

      currentLevel = node.children;
    }
  }

  return root;
}

/** Recursively compute total count for a node (itself + all descendants). */
function getTotalCount(node: TagTreeNode): number {
  let total = node.count;
  for (const child of node.children.values()) {
    total += getTotalCount(child);
  }
  return total;
}

/** Check if a node or any descendant matches a filter string. */
function nodeMatchesFilter(node: TagTreeNode, filter: string): boolean {
  const lower = filter.toLowerCase();
  if (node.segment.toLowerCase().includes(lower)) return true;
  if (node.fullTag && node.fullTag.toLowerCase().includes(lower)) return true;
  for (const child of node.children.values()) {
    if (nodeMatchesFilter(child, lower)) return true;
  }
  return false;
}

function TagTreeItem({
  node,
  depth,
  filter,
  expandedNodes,
  onToggle,
  onTagClick,
  onFileSelect,
  selectedTag,
}: {
  node: TagTreeNode;
  depth: number;
  filter: string;
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
  onTagClick: (tag: string) => void;
  onFileSelect: (filePath: string) => void;
  selectedTag: string | null;
}) {
  const hasChildren = node.children.size > 0;
  const nodeKey = node.fullTag || `__group:${node.segment}:${depth}`;
  const isExpanded = expandedNodes.has(nodeKey);
  const totalCount = getTotalCount(node);
  const isSelected = selectedTag === node.fullTag;

  // Filter: skip nodes that don't match
  if (filter && !nodeMatchesFilter(node, filter)) {
    return null;
  }

  const sortedChildren = Array.from(node.children.values()).sort(
    (a, b) => getTotalCount(b) - getTotalCount(a) || a.segment.localeCompare(b.segment)
  );

  return (
    <div className="tag-tree-item">
      <button
        className={`tag-tree-row ${isSelected ? "tag-tree-row-active" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.fullTag) {
            onTagClick(node.fullTag);
          }
          if (hasChildren) {
            onToggle(nodeKey);
          }
        }}
        title={
          node.fullTag
            ? `${node.fullTag} (${node.count} file${node.count !== 1 ? "s" : ""})`
            : `${node.segment} group (${totalCount} total)`
        }
      >
        {hasChildren && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={`tag-tree-chevron ${isExpanded ? "tag-tree-chevron-open" : ""}`}
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
        )}
        {!hasChildren && <span className="tag-tree-spacer" />}

        <span className="tag-tree-hash">#</span>
        <span className="tag-tree-label">{node.segment}</span>
        <span className="tag-tree-count">{totalCount}</span>
      </button>

      {/* Show files if this tag is selected */}
      {isSelected && node.fullTag && node.files.length > 0 && (
        <div className="tag-files-list">
          {node.files.map((filePath) => {
            const fileName = filePath.split("/").pop()?.replace(/\.(md|markdown)$/i, "") || filePath;
            return (
              <button
                key={filePath}
                className="tag-file-item"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onFileSelect(filePath);
                }}
                title={filePath}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="tag-file-icon">
                  <path
                    d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="none"
                  />
                  <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" fill="none" />
                </svg>
                <span className="tag-file-name">{fileName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Render children if expanded */}
      {isExpanded &&
        sortedChildren.map((child) => (
          <TagTreeItem
            key={child.segment}
            node={child}
            depth={depth + 1}
            filter={filter}
            expandedNodes={expandedNodes}
            onToggle={onToggle}
            onTagClick={onTagClick}
            onFileSelect={onFileSelect}
            selectedTag={selectedTag}
          />
        ))}
    </div>
  );
}

export default function TagPane({
  vaultPath,
  onTagClick,
  onFileSelect,
  visible,
}: TagPaneProps) {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const loadTags = useCallback(async () => {
    if (!vaultPath) return;
    setLoading(true);
    try {
      const result = await getAllTags(vaultPath);
      setTags(result);
    } catch (err) {
      console.error("Failed to load tags:", err);
    } finally {
      setLoading(false);
    }
  }, [vaultPath]);

  // Load tags when the pane becomes visible or vault changes
  useEffect(() => {
    if (visible && vaultPath) {
      loadTags();
    }
  }, [visible, vaultPath, loadTags]);

  const tree = useMemo(() => buildTagTree(tags), [tags]);

  const handleToggle = useCallback((key: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleTagClick = useCallback(
    (tag: string) => {
      setSelectedTag((prev) => (prev === tag ? null : tag));
      onTagClick(tag);
    },
    [onTagClick]
  );

  const handleExpandAll = useCallback(() => {
    const allKeys = new Set<string>();
    function collectKeys(nodes: Map<string, TagTreeNode>, depth: number) {
      for (const node of nodes.values()) {
        if (node.children.size > 0) {
          const key = node.fullTag || `__group:${node.segment}:${depth}`;
          allKeys.add(key);
          collectKeys(node.children, depth + 1);
        }
      }
    }
    collectKeys(tree, 0);
    setExpandedNodes(allKeys);
  }, [tree]);

  const handleCollapseAll = useCallback(() => {
    setExpandedNodes(new Set());
    setSelectedTag(null);
  }, []);

  if (!visible) return null;

  const sortedRootNodes = Array.from(tree.values()).sort(
    (a, b) => getTotalCount(b) - getTotalCount(a) || a.segment.localeCompare(b.segment)
  );

  const totalTagCount = tags.length;

  return (
    <div className="tag-pane">
      {/* Header */}
      <div className="tag-pane-header">
        <span className="tag-pane-title">
          Tags
          {totalTagCount > 0 && (
            <span className="tag-pane-total">{totalTagCount}</span>
          )}
        </span>
        <div className="tag-pane-actions">
          <button
            className="tag-pane-btn"
            onClick={handleExpandAll}
            title="Expand all"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            className="tag-pane-btn"
            onClick={handleCollapseAll}
            title="Collapse all"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            className="tag-pane-btn"
            onClick={loadTags}
            title="Refresh tags"
            disabled={loading}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              className={loading ? "tag-pane-spin" : ""}
            >
              <path
                d="M14 8A6 6 0 114 3.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M14 3v5h-5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Search filter */}
      <div className="tag-pane-filter">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="tag-filter-icon">
          <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input
          ref={filterInputRef}
          type="text"
          placeholder="Filter tags..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="tag-filter-input"
        />
        {filter && (
          <button
            className="tag-filter-clear"
            onClick={() => setFilter("")}
            title="Clear filter"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Tag tree */}
      <div className="tag-pane-content">
        {loading && tags.length === 0 ? (
          <div className="tag-pane-empty">
            <span className="tag-pane-loading">Scanning tags...</span>
          </div>
        ) : sortedRootNodes.length === 0 ? (
          <div className="tag-pane-empty">
            <span>
              {filter ? "No tags match the filter" : "No tags found in vault"}
            </span>
          </div>
        ) : (
          sortedRootNodes.map((node) => (
            <TagTreeItem
              key={node.segment}
              node={node}
              depth={0}
              filter={filter}
              expandedNodes={expandedNodes}
              onToggle={handleToggle}
              onTagClick={handleTagClick}
              onFileSelect={onFileSelect}
              selectedTag={selectedTag}
            />
          ))
        )}
      </div>
    </div>
  );
}
