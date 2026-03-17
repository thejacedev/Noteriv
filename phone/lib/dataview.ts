/**
 * Dataview query engine for querying vault notes like a database.
 *
 * Supports:
 *   TABLE field1, field2 FROM #tag WHERE condition SORT BY field LIMIT n
 *   LIST FROM "folder" WHERE condition
 *   TASK FROM #tag WHERE !completed
 */

export type QueryType = "TABLE" | "LIST" | "TASK";

export interface DataviewQuery {
  type: QueryType;
  fields: string[];
  from: QueryFrom;
  where: WhereClause | null;
  sortBy: { field: string; order: "ASC" | "DESC" } | null;
  limit: number | null;
}

export type QueryFrom =
  | { type: "all" }
  | { type: "tag"; tag: string }
  | { type: "folder"; path: string };

export type WhereClause =
  | { type: "comparison"; field: string; op: "=" | "!=" | ">" | "<" | ">=" | "<="; value: string }
  | { type: "contains"; field: string; value: string }
  | { type: "not"; clause: WhereClause }
  | { type: "and"; left: WhereClause; right: WhereClause }
  | { type: "or"; left: WhereClause; right: WhereClause };

export interface NoteData {
  file: {
    name: string;
    path: string;
    folder: string;
    tags: string[];
    created: string;
    modified: string;
    size: number;
  };
  frontmatter: Record<string, string>;
  tasks: { text: string; completed: boolean; line: number }[];
  content: string;
}

export interface QueryResult {
  type: QueryType;
  fields: string[];
  rows: Record<string, string>[];
  tasks?: { text: string; completed: boolean; filePath: string; fileName: string }[];
  error?: string;
}

/** Parse a dataview query string */
export function parseQuery(queryStr: string): DataviewQuery | { error: string } {
  const trimmed = queryStr.trim();
  const tokens = tokenize(trimmed);

  if (tokens.length === 0) return { error: "Empty query" };

  const typeToken = tokens[0].toUpperCase();
  if (typeToken !== "TABLE" && typeToken !== "LIST" && typeToken !== "TASK") {
    return { error: `Unknown query type: ${tokens[0]}. Use TABLE, LIST, or TASK.` };
  }

  const type = typeToken as QueryType;
  let i = 1;

  // Parse fields (TABLE only)
  const fields: string[] = [];
  if (type === "TABLE") {
    while (i < tokens.length && tokens[i].toUpperCase() !== "FROM") {
      const field = tokens[i].replace(/,$/g, "").replace(/^,/g, "");
      if (field && field !== ",") fields.push(field);
      i++;
    }
  }

  // Parse FROM
  let from: QueryFrom = { type: "all" };
  if (i < tokens.length && tokens[i].toUpperCase() === "FROM") {
    i++;
    if (i < tokens.length) {
      const source = tokens[i];
      if (source.startsWith("#")) {
        from = { type: "tag", tag: source.slice(1) };
      } else if (source.startsWith('"') && source.endsWith('"')) {
        const path = source.slice(1, -1);
        from = path === "" ? { type: "all" } : { type: "folder", path };
      } else {
        from = { type: "folder", path: source };
      }
      i++;
    }
  }

  // Parse WHERE
  let where: WhereClause | null = null;
  if (i < tokens.length && tokens[i].toUpperCase() === "WHERE") {
    i++;
    const result = parseWhereClause(tokens, i);
    where = result.clause;
    i = result.nextIndex;
  }

  // Parse SORT BY
  let sortBy: DataviewQuery["sortBy"] = null;
  if (i < tokens.length && tokens[i].toUpperCase() === "SORT") {
    i++;
    if (i < tokens.length && tokens[i].toUpperCase() === "BY") i++;
    if (i < tokens.length) {
      const field = tokens[i];
      i++;
      let order: "ASC" | "DESC" = "ASC";
      if (i < tokens.length && (tokens[i].toUpperCase() === "ASC" || tokens[i].toUpperCase() === "DESC")) {
        order = tokens[i].toUpperCase() as "ASC" | "DESC";
        i++;
      }
      sortBy = { field, order };
    }
  }

  // Parse LIMIT
  let limit: number | null = null;
  if (i < tokens.length && tokens[i].toUpperCase() === "LIMIT") {
    i++;
    if (i < tokens.length) {
      limit = parseInt(tokens[i]);
      if (isNaN(limit)) limit = null;
    }
  }

  return { type, fields, from, where, sortBy, limit };
}

function tokenize(str: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === " " || str[i] === "\n" || str[i] === "\t") { i++; continue; }
    if (str[i] === '"') {
      let j = i + 1;
      while (j < str.length && str[j] !== '"') j++;
      tokens.push(str.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < str.length && str[j] !== " " && str[j] !== "\n" && str[j] !== "\t") j++;
    tokens.push(str.slice(i, j));
    i = j;
  }
  return tokens;
}

function parseWhereClause(tokens: string[], start: number): { clause: WhereClause; nextIndex: number } {
  let i = start;

  // Check for NOT
  if (i < tokens.length && tokens[i] === "!") {
    i++;
    const result = parseWhereClause(tokens, i);
    return { clause: { type: "not", clause: result.clause }, nextIndex: result.nextIndex };
  }

  if (i >= tokens.length) {
    return { clause: { type: "comparison", field: "", op: "=", value: "" }, nextIndex: i };
  }

  // Simple comparison: field op value
  const field = tokens[i];
  i++;

  // Check for AND/OR/SORT/LIMIT (means this was a boolean field)
  if (i >= tokens.length || ["AND", "OR", "SORT", "LIMIT"].includes(tokens[i]?.toUpperCase())) {
    const clause: WhereClause = { type: "comparison", field, op: "!=", value: "" };
    // Check for AND/OR
    if (i < tokens.length && tokens[i].toUpperCase() === "AND") {
      i++;
      const right = parseWhereClause(tokens, i);
      return { clause: { type: "and", left: clause, right: right.clause }, nextIndex: right.nextIndex };
    }
    if (i < tokens.length && tokens[i].toUpperCase() === "OR") {
      i++;
      const right = parseWhereClause(tokens, i);
      return { clause: { type: "or", left: clause, right: right.clause }, nextIndex: right.nextIndex };
    }
    return { clause, nextIndex: i };
  }

  // Check for contains()
  if (field.startsWith("contains(")) {
    const inner = field.slice(9);
    const valueToken = tokens[i]?.replace(/\)$/, "") || "";
    i++;
    return {
      clause: { type: "contains", field: inner.replace(/,$/, ""), value: valueToken.replace(/^["']|["']$/g, "") },
      nextIndex: i,
    };
  }

  const op = tokens[i] as WhereClause & { type: "comparison" } extends { op: infer O } ? O : string;
  i++;

  const value = i < tokens.length ? tokens[i].replace(/^["']|["']$/g, "") : "";
  i++;

  const clause: WhereClause = { type: "comparison", field, op: op as "=" | "!=" | ">" | "<" | ">=" | "<=", value };

  // Check for AND/OR
  if (i < tokens.length && tokens[i].toUpperCase() === "AND") {
    i++;
    const right = parseWhereClause(tokens, i);
    return { clause: { type: "and", left: clause, right: right.clause }, nextIndex: right.nextIndex };
  }
  if (i < tokens.length && tokens[i].toUpperCase() === "OR") {
    i++;
    const right = parseWhereClause(tokens, i);
    return { clause: { type: "or", left: clause, right: right.clause }, nextIndex: right.nextIndex };
  }

  return { clause, nextIndex: i };
}

/** Resolve a field path from note data */
function resolveField(note: NoteData, field: string): string {
  if (field.startsWith("file.")) {
    const key = field.slice(5) as keyof NoteData["file"];
    const val = note.file[key];
    return Array.isArray(val) ? val.join(", ") : String(val ?? "");
  }
  // Frontmatter field
  return note.frontmatter[field] ?? "";
}

/** Evaluate a WHERE clause against a note */
function evaluateWhere(note: NoteData, clause: WhereClause): boolean {
  switch (clause.type) {
    case "not":
      return !evaluateWhere(note, clause.clause);
    case "and":
      return evaluateWhere(note, clause.left) && evaluateWhere(note, clause.right);
    case "or":
      return evaluateWhere(note, clause.left) || evaluateWhere(note, clause.right);
    case "contains": {
      const val = resolveField(note, clause.field);
      return val.toLowerCase().includes(clause.value.toLowerCase());
    }
    case "comparison": {
      // Special: "completed" for tasks
      if (clause.field === "completed") return true;

      const val = resolveField(note, clause.field);
      const target = clause.value;

      switch (clause.op) {
        case "=": return val === target;
        case "!=": return val !== target;
        case ">": return val > target;
        case "<": return val < target;
        case ">=": return val >= target;
        case "<=": return val <= target;
        default: return false;
      }
    }
  }
}

/** Execute a parsed query against a list of notes */
export function executeQuery(query: DataviewQuery, notes: NoteData[]): QueryResult {
  // Filter by FROM
  let filtered = notes;
  const from = query.from;
  if (from.type === "tag") {
    filtered = filtered.filter((n) => n.file.tags.includes(from.tag));
  } else if (from.type === "folder") {
    filtered = filtered.filter((n) => n.file.folder.startsWith(from.path));
  }

  // Filter by WHERE
  if (query.where) {
    filtered = filtered.filter((n) => evaluateWhere(n, query.where!));
  }

  // Sort
  if (query.sortBy) {
    const { field, order } = query.sortBy;
    filtered.sort((a, b) => {
      const va = resolveField(a, field);
      const vb = resolveField(b, field);
      const cmp = va.localeCompare(vb);
      return order === "DESC" ? -cmp : cmp;
    });
  }

  // Limit
  if (query.limit) {
    filtered = filtered.slice(0, query.limit);
  }

  // Build results based on type
  if (query.type === "TASK") {
    const tasks: QueryResult["tasks"] = [];
    for (const note of filtered) {
      for (const task of note.tasks) {
        tasks.push({
          text: task.text,
          completed: task.completed,
          filePath: note.file.path,
          fileName: note.file.name,
        });
      }
    }
    return { type: "TASK", fields: [], rows: [], tasks };
  }

  if (query.type === "LIST") {
    const rows = filtered.map((n) => ({
      "file.name": n.file.name,
      "file.path": n.file.path,
    }));
    return { type: "LIST", fields: ["file.name"], rows };
  }

  // TABLE
  const fields = query.fields.length > 0 ? query.fields : ["file.name"];
  const rows = filtered.map((n) => {
    const row: Record<string, string> = {};
    for (const f of fields) {
      row[f] = resolveField(n, f);
    }
    row["file.path"] = n.file.path;
    return row;
  });

  return { type: "TABLE", fields, rows };
}

/** Parse note content into NoteData */
export function parseNoteData(
  filePath: string,
  content: string,
  stats: { created: string; modified: string; size: number }
): NoteData {
  const name = filePath.split("/").pop()?.replace(/\.(md|markdown)$/i, "") || "";
  const folder = filePath.substring(0, filePath.lastIndexOf("/"));

  // Extract tags
  const tags: string[] = [];
  const tagMatches = content.matchAll(/#([\w-]+)/g);
  for (const m of tagMatches) {
    if (!tags.includes(m[1])) tags.push(m[1]);
  }

  // Extract frontmatter
  const frontmatter: Record<string, string> = {};
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const lines = fmMatch[1].split("\n");
    for (const line of lines) {
      const kv = line.match(/^(\w+):\s*(.+)/);
      if (kv) {
        frontmatter[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
        // Also add frontmatter tags
        if (kv[1] === "tags") {
          const fmTags = kv[2].replace(/[\[\]"']/g, "").split(",").map((t) => t.trim()).filter(Boolean);
          for (const t of fmTags) if (!tags.includes(t)) tags.push(t);
        }
      }
    }
  }

  // Extract tasks
  const tasks: NoteData["tasks"] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)-\s*\[([ xX])\]\s*(.*)/);
    if (m) {
      tasks.push({ text: m[3], completed: m[2].toLowerCase() === "x", line: i + 1 });
    }
  }

  return {
    file: { name, path: filePath, folder, tags, ...stats },
    frontmatter,
    tasks,
    content,
  };
}
