/**
 * The expression language of base filters and formulas: a tokenizer and a
 * parser that turn text such as `price > 2.1 && file.hasTag("book")` into a
 * tree. Nothing is evaluated here.
 */

export type BinaryOperator =
  | "||"
  | "&&"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/"
  | "%";

/** One node of a parsed expression. `pos` is where it starts in the source. */
export type Expr =
  | { type: "literal"; value: string | number | boolean | null; pos: number }
  | { type: "regexp"; source: string; flags: string; pos: number }
  | { type: "list"; items: Expr[]; pos: number }
  | { type: "object"; entries: { key: string; value: Expr }[]; pos: number }
  | { type: "identifier"; name: string; pos: number }
  | { type: "member"; object: Expr; property: string; pos: number }
  | { type: "index"; object: Expr; index: Expr; pos: number }
  | { type: "call"; callee: Expr; args: Expr[]; pos: number }
  | { type: "unary"; operator: "!" | "-"; operand: Expr; pos: number }
  | { type: "binary"; operator: BinaryOperator; left: Expr; right: Expr; pos: number };

export type ParseResult =
  | { ok: true; expr: Expr }
  | { ok: false; error: string; position: number };

type Token =
  | { type: "number"; value: number; pos: number }
  | { type: "string"; value: string; pos: number }
  | { type: "identifier"; value: string; pos: number }
  | { type: "regexp"; source: string; flags: string; pos: number }
  | { type: "punctuation"; value: string; pos: number }
  | { type: "end"; pos: number };

/** A syntax error, with the place it was found. Never leaves this module. */
class SyntaxProblem extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
  }
}

const PUNCTUATION = ["||", "&&", "==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/", "%", "!", "(", ")", "[", "]", "{", "}", ",", ".", ":"];

const IDENTIFIER_START = /[\p{L}_$]/u;
const IDENTIFIER_PART = /[\p{L}\p{N}_$]/u;

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" };

function readString(source: string, start: number): { value: string; end: number } {
  const quote = source[start];
  let value = "";
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === quote) return { value, end: i + 1 };
    if (ch === "\\" && i + 1 < source.length) {
      const next = source[i + 1];
      if (next === "u" && /^[0-9a-fA-F]{4}$/.test(source.slice(i + 2, i + 6))) {
        value += String.fromCharCode(parseInt(source.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      value += ESCAPES[next] ?? next;
      i += 2;
      continue;
    }
    value += ch;
    i++;
  }
  throw new SyntaxProblem("This text is missing its closing quote", start);
}

function readRegExp(source: string, start: number): { pattern: string; flags: string; end: number } {
  let i = start + 1;
  let inClass = false;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n") break;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) {
      const pattern = source.slice(start + 1, i);
      let end = i + 1;
      while (end < source.length && /[a-z]/i.test(source[end])) end++;
      return { pattern, flags: source.slice(i + 1, end), end };
    }
    i++;
  }
  throw new SyntaxProblem("This regular expression is missing its closing /", start);
}

/**
 * A "/" starts a regular expression unless it follows something it could
 * divide: a value, or the end of one.
 */
function divides(previous: Token | undefined): boolean {
  if (!previous) return false;
  if (previous.type === "punctuation") return [")", "]", "}"].includes(previous.value);
  return previous.type !== "end";
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const match = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i));
      const text = match ? match[0] : ch;
      tokens.push({ type: "number", value: Number(text), pos: i });
      i += text.length;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const { value, end } = readString(source, i);
      tokens.push({ type: "string", value, pos: i });
      i = end;
      continue;
    }

    if (IDENTIFIER_START.test(ch)) {
      let end = i + 1;
      while (end < source.length && IDENTIFIER_PART.test(source[end])) end++;
      tokens.push({ type: "identifier", value: source.slice(i, end), pos: i });
      i = end;
      continue;
    }

    if (ch === "/" && !divides(tokens[tokens.length - 1])) {
      const { pattern, flags, end } = readRegExp(source, i);
      tokens.push({ type: "regexp", source: pattern, flags, pos: i });
      i = end;
      continue;
    }

    const punctuation = PUNCTUATION.find((p) => source.startsWith(p, i));
    if (!punctuation) {
      if (ch === "=") throw new SyntaxProblem('Use "==" to compare two values', i);
      if (ch === "&" || ch === "|") throw new SyntaxProblem(`Use "${ch}${ch}" to combine two conditions`, i);
      throw new SyntaxProblem(`Unexpected character "${ch}"`, i);
    }
    if ((punctuation === "==" || punctuation === "!=") && source[i + 2] === "=") {
      throw new SyntaxProblem(`Use "${punctuation}" to compare two values`, i);
    }
    tokens.push({ type: "punctuation", value: punctuation, pos: i });
    i += punctuation.length;
  }

  tokens.push({ type: "end", pos: source.length });
  return tokens;
}

/** Binary operators from loosest to tightest. All of them group left to right. */
const PRECEDENCE: BinaryOperator[][] = [
  ["||"],
  ["&&"],
  ["==", "!="],
  ["<", "<=", ">", ">="],
  ["+", "-"],
  ["*", "/", "%"],
];

/** Deep enough for any real formula; stops a runaway one from exhausting the stack. */
const MAX_DEPTH = 150;

class Parser {
  private index = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    if (this.peek().type === "end") throw new SyntaxProblem("The expression is empty", 0);
    const expr = this.expression();
    const rest = this.peek();
    if (rest.type !== "end") throw new SyntaxProblem(`Unexpected ${describe(rest)}`, rest.pos);
    return expr;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  private isPunctuation(value: string): boolean {
    const token = this.peek();
    return token.type === "punctuation" && token.value === value;
  }

  private take(value: string): boolean {
    if (!this.isPunctuation(value)) return false;
    this.index++;
    return true;
  }

  private expect(value: string, opened?: Token): void {
    if (this.take(value)) return;
    const token = this.peek();
    if (opened && token.type === "end") {
      throw new SyntaxProblem(`Missing "${value}"`, opened.pos);
    }
    throw new SyntaxProblem(`Expected "${value}" but found ${describe(token)}`, token.pos);
  }

  private expression(): Expr {
    if (++this.depth > MAX_DEPTH) {
      throw new SyntaxProblem("The expression is nested too deeply", this.peek().pos);
    }
    const expr = this.binary(0);
    this.depth--;
    return expr;
  }

  private binary(level: number): Expr {
    if (level >= PRECEDENCE.length) return this.unary();
    let left = this.binary(level + 1);
    for (;;) {
      const token = this.peek();
      if (token.type !== "punctuation") return left;
      const operator = PRECEDENCE[level].find((op) => op === token.value);
      if (!operator) return left;
      this.index++;
      const right = this.binary(level + 1);
      left = { type: "binary", operator, left, right, pos: left.pos };
    }
  }

  private unary(): Expr {
    const token = this.peek();
    if (token.type === "punctuation" && (token.value === "!" || token.value === "-")) {
      this.index++;
      if (++this.depth > MAX_DEPTH) {
        throw new SyntaxProblem("The expression is nested too deeply", token.pos);
      }
      const operand = this.unary();
      this.depth--;
      // "-5" is the number itself, so (-5).abs() and a list of negatives read naturally.
      if (token.value === "-" && operand.type === "literal" && typeof operand.value === "number") {
        return { type: "literal", value: -operand.value, pos: token.pos };
      }
      return { type: "unary", operator: token.value, operand, pos: token.pos };
    }
    return this.postfix();
  }

  private postfix(): Expr {
    let expr = this.primary();
    for (;;) {
      const token = this.peek();
      if (this.take(".")) {
        const name = this.next();
        if (name.type !== "identifier") {
          throw new SyntaxProblem(`Expected a name after "." but found ${describe(name)}`, name.pos);
        }
        expr = { type: "member", object: expr, property: name.value, pos: expr.pos };
      } else if (this.take("[")) {
        const index = this.expression();
        this.expect("]", token);
        expr = { type: "index", object: expr, index, pos: expr.pos };
      } else if (this.take("(")) {
        expr = { type: "call", callee: expr, args: this.list(")", token), pos: expr.pos };
      } else {
        return expr;
      }
    }
  }

  /** Comma-separated expressions up to the closing bracket, which is consumed. */
  private list(close: string, opened: Token): Expr[] {
    const items: Expr[] = [];
    if (this.take(close)) return items;
    for (;;) {
      items.push(this.expression());
      if (this.take(",")) {
        // A trailing comma is allowed, as in JavaScript.
        if (this.take(close)) return items;
        continue;
      }
      this.expect(close, opened);
      return items;
    }
  }

  private primary(): Expr {
    const token = this.next();
    switch (token.type) {
      case "number":
      case "string":
        return { type: "literal", value: token.value, pos: token.pos };
      case "regexp":
        return { type: "regexp", source: token.source, flags: token.flags, pos: token.pos };
      case "identifier":
        if (token.value === "true") return { type: "literal", value: true, pos: token.pos };
        if (token.value === "false") return { type: "literal", value: false, pos: token.pos };
        if (token.value === "null") return { type: "literal", value: null, pos: token.pos };
        return { type: "identifier", name: token.value, pos: token.pos };
      case "punctuation":
        if (token.value === "(") {
          const expr = this.expression();
          this.expect(")", token);
          return expr;
        }
        if (token.value === "[") {
          return { type: "list", items: this.list("]", token), pos: token.pos };
        }
        if (token.value === "{") return this.object(token);
        throw new SyntaxProblem(`Unexpected ${describe(token)}`, token.pos);
      case "end":
        this.index--;
        throw new SyntaxProblem("The expression ends too early", token.pos);
    }
  }

  private object(opened: Token): Expr {
    const entries: { key: string; value: Expr }[] = [];
    if (this.take("}")) return { type: "object", entries, pos: opened.pos };
    for (;;) {
      const key = this.next();
      if (key.type !== "string" && key.type !== "identifier" && key.type !== "number") {
        throw new SyntaxProblem(`Expected a key but found ${describe(key)}`, key.pos);
      }
      this.expect(":");
      entries.push({ key: String(key.value), value: this.expression() });
      if (this.take(",")) {
        if (this.take("}")) break;
        continue;
      }
      this.expect("}", opened);
      break;
    }
    return { type: "object", entries, pos: opened.pos };
  }
}

function describe(token: Token): string {
  switch (token.type) {
    case "end":
      return "the end of the expression";
    case "number":
      return `the number ${token.value}`;
    case "string":
      return `the text "${token.value}"`;
    case "regexp":
      return "a regular expression";
    default:
      return `"${token.value}"`;
  }
}

/** Parse one filter statement or formula. Never throws. */
export function parseExpression(source: string): ParseResult {
  try {
    return { ok: true, expr: new Parser(tokenize(source)).parse() };
  } catch (problem) {
    if (problem instanceof SyntaxProblem) {
      return { ok: false, error: problem.message, position: problem.position };
    }
    // A stack overflow or the like: still an answer, not an exception.
    return { ok: false, error: "The expression could not be read", position: 0 };
  }
}

/** Parsed expressions by source. Views re-run on every edit, with the same few formulas. */
const cache = new Map<string, ParseResult>();
const CACHE_LIMIT = 2000;

/** `parseExpression`, remembering the result for the next run. */
export function compileExpression(source: string): ParseResult {
  const held = cache.get(source);
  if (held) return held;
  if (cache.size >= CACHE_LIMIT) cache.clear();
  const parsed = parseExpression(source);
  cache.set(source, parsed);
  return parsed;
}
