/**
 * Evaluates a parsed expression against one row. Nothing here throws: a
 * mistake in a formula becomes an error value in the place of its result,
 * and passes through every operator and call that uses it.
 */

import { compareOrdered, looseEquals, numericValue } from "./compare";
import {
  addDuration,
  addDurations,
  dateDifference,
  durationMs,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_MONTH,
  MS_PER_SECOND,
  parseDateText,
  parseDuration,
  scaleDuration,
} from "./dates";
import {
  createEnv,
  fileField,
  noteProperties,
  noteProperty,
  rowState,
  type EnvOptions,
  type EvalEnv,
} from "./environment";
import { compileExpression, type Expr } from "./expression";
import { formatValue } from "./format";
import { callGlobal, callMethod, isGlobalFunction, LAZY_LIST_METHODS } from "./functions";
import {
  errorValue,
  fileValue,
  getField,
  isError,
  isKind,
  isTruthy,
  objectValue,
  typeLabel,
  type BaseValue,
  type DateValue,
  type DurationValue,
  type ErrorValue,
  type NoteRow,
} from "./values";

/** What an expression can see while it runs. */
export interface Scope {
  env: EvalEnv;
  /** The file being tested or shown. Null in a summary formula. */
  row: NoteRow | null;
  /** Names bound by the surrounding call: `value`, `index`, `acc`, `values`. */
  locals: Record<string, BaseValue> | null;
}

type Namespace = "note" | "formula" | "this";

/**
 * `note`, `formula` and `this` are read by the name that follows them,
 * unless a surrounding call has bound the same word.
 */
function namespaceOf(node: Expr, scope: Scope): Namespace | null {
  if (node.type !== "identifier") return null;
  if (scope.locals && Object.hasOwn(scope.locals, node.name)) return null;
  return node.name === "note" || node.name === "formula" || node.name === "this" ? node.name : null;
}

function readNamespace(namespace: Namespace, name: string, scope: Scope): BaseValue {
  const { env } = scope;
  switch (namespace) {
    case "note":
      return scope.row ? noteProperty(env, scope.row, name) : null;
    case "formula":
      return evaluateFormula(env, scope.row, name);
    case "this":
      if (!env.thisRow) return null;
      return name === "file" ? fileValue(env.thisRow) : noteProperty(env, env.thisRow, name);
  }
}

/**
 * The value of one formula for one row. Each is computed once per row, and
 * a formula that reaches itself through others is an error, not a loop.
 */
export function evaluateFormula(env: EvalEnv, row: NoteRow | null, name: string): BaseValue {
  const compiled = env.formulas.get(name);
  if (!compiled) return errorValue(`There is no formula called "${name}"`);
  if (!compiled.ok) return errorValue(`Formula "${name}": ${compiled.error}`);
  if (!row) return evaluate(compiled.expr, { env, row: null, locals: null });

  const state = rowState(env, row);
  const held = state.formulas.get(name);
  if (held !== undefined) return held;
  if (state.computing.has(name)) return errorValue(`Formula "${name}" refers to itself`);

  state.computing.add(name);
  let value: BaseValue;
  try {
    value = evaluate(compiled.expr, { env, row, locals: null });
  } finally {
    state.computing.delete(name);
  }
  state.formulas.set(name, value);
  return value;
}

function identifier(name: string, scope: Scope): BaseValue {
  const { env, row, locals } = scope;
  if (locals && Object.hasOwn(locals, name)) return locals[name];
  switch (name) {
    case "file":
      return row ? fileValue(row) : null;
    case "note":
      return row ? noteProperties(env, row) : null;
    case "this":
      return env.thisRow ? fileValue(env.thisRow) : null;
    case "formula":
      return errorValue('"formula" must be followed by the name of a formula, as in formula.total');
    default:
      // A bare name is a note property.
      return row ? noteProperty(env, row, name) : null;
  }
}

const DATE_FIELDS: Record<string, (d: Date) => number> = {
  year: (d) => d.getFullYear(),
  month: (d) => d.getMonth() + 1,
  day: (d) => d.getDate(),
  hour: (d) => d.getHours(),
  minute: (d) => d.getMinutes(),
  second: (d) => d.getSeconds(),
  millisecond: (d) => d.getMilliseconds(),
};

/**
 * A duration's length in each unit. Obsidian's function reference does not
 * list these, but without them the result of subtracting two dates could
 * not be turned into a number of days.
 */
const DURATION_FIELDS: Record<string, number> = {
  years: 12 * MS_PER_MONTH,
  months: MS_PER_MONTH,
  weeks: 7 * MS_PER_DAY,
  days: MS_PER_DAY,
  hours: MS_PER_HOUR,
  minutes: MS_PER_MINUTE,
  seconds: MS_PER_SECOND,
  milliseconds: 1,
};

function noField(value: BaseValue, name: string): ErrorValue {
  return errorValue(`There is no "${name}" on ${typeLabel(value)}`);
}

function readField(value: BaseValue, name: string, env: EvalEnv): BaseValue {
  // An empty value has empty fields, so a chain through a missing property stays empty.
  if (value === null || isError(value)) return value;
  if (typeof value === "string") return name === "length" ? value.length : noField(value, name);
  if (Array.isArray(value)) return name === "length" ? value.length : noField(value, name);
  if (typeof value !== "object") return noField(value, name);

  switch (value.kind) {
    case "date":
      return Object.hasOwn(DATE_FIELDS, name) ? DATE_FIELDS[name](new Date(value.ms)) : noField(value, name);
    case "duration":
      return Object.hasOwn(DURATION_FIELDS, name)
        ? durationMs(value) / DURATION_FIELDS[name]
        : noField(value, name);
    case "file":
      return fileField(env, value.row, name);
    case "object":
      return getField(value, name);
    case "url":
      return name === "length" ? value.href.length : noField(value, name);
    default:
      return noField(value, name);
  }
}

function readIndex(value: BaseValue, key: BaseValue, env: EvalEnv): BaseValue {
  if (value === null || isError(value)) return value;
  if (Array.isArray(value) || typeof value === "string") {
    const index = numericValue(key);
    if (index === null) return errorValue(`${typeLabel(value)} is indexed by a number, not ${typeLabel(key)}`);
    return (Number.isInteger(index) ? value[index] : undefined) ?? null;
  }
  if (isKind(value, "object") || isKind(value, "file")) {
    if (typeof key !== "string" && typeof key !== "number") {
      return errorValue(`A property name must be text, not ${typeLabel(key)}`);
    }
    return readField(value, String(key), env);
  }
  return errorValue(`${typeLabel(value)} cannot be indexed`);
}

/** A duration, or text that reads as one, as the right side of date arithmetic allows. */
function asDuration(value: BaseValue): DurationValue | null {
  if (isKind(value, "duration")) return value;
  return typeof value === "string" ? parseDuration(value) : null;
}

function asDate(value: BaseValue): DateValue | null {
  if (isKind(value, "date")) return value;
  return typeof value === "string" ? parseDateText(value) : null;
}

function cannot(action: string, left: BaseValue, right: BaseValue): ErrorValue {
  return errorValue(`Cannot ${action} ${typeLabel(left)} and ${typeLabel(right)}`);
}

const isText = (value: BaseValue) => typeof value === "string" || isKind(value, "url") || isKind(value, "tag");

/**
 * "+" adds numbers, moves a date by a duration, and otherwise joins text.
 * An empty value joins as nothing; in arithmetic it makes the result empty.
 */
function add(left: BaseValue, right: BaseValue): BaseValue {
  if (isKind(left, "date") || isKind(right, "date")) {
    const date = isKind(left, "date") ? left : (right as DateValue);
    const other = isKind(left, "date") ? right : left;
    // Text that is a duration moves the date; any other text is joined to it.
    const by = isKind(left, "date") || isKind(other, "duration") ? asDuration(other) : null;
    if (by) return addDuration(date, by, 1);
    if (other === null) return null;
    if (isText(other)) return formatValue(left) + formatValue(right);
    return cannot("add", left, right);
  }

  if (isKind(left, "duration") || isKind(right, "duration")) {
    const a = asDuration(left);
    const b = asDuration(right);
    if (a && b) return addDurations(a, b, 1);
    if (left === null || right === null) return null;
    if (isText(left) || isText(right)) return formatValue(left) + formatValue(right);
    return cannot("add", left, right);
  }

  // A missing date plus "2w" is a missing deadline, not the text "2w".
  if (left === null && asDuration(right)) return null;
  if (isText(left) || isText(right)) return formatValue(left) + formatValue(right);
  if (left === null || right === null) return null;
  if (typeof left === "number" && typeof right === "number") return left + right;
  return cannot("add", left, right);
}

function subtract(left: BaseValue, right: BaseValue): BaseValue {
  if (isKind(left, "date")) {
    if (right === null) return null;
    const by = asDuration(right);
    if (by) return addDuration(left, by, -1);
    const other = asDate(right);
    return other ? dateDifference(left, other) : cannot("subtract", left, right);
  }
  if (isKind(right, "date")) {
    if (left === null) return null;
    const other = asDate(left);
    return other ? dateDifference(other, right) : cannot("subtract", left, right);
  }
  if (left === null || right === null) return null;
  if (isKind(left, "duration") || isKind(right, "duration")) {
    const a = asDuration(left);
    const b = asDuration(right);
    return a && b ? addDurations(a, b, -1) : cannot("subtract", left, right);
  }
  const a = numericValue(left);
  const b = numericValue(right);
  return a !== null && b !== null ? a - b : cannot("subtract", left, right);
}

function multiply(left: BaseValue, right: BaseValue): BaseValue {
  if (left === null || right === null) return null;
  const a = numericValue(left);
  const b = numericValue(right);
  if (isKind(left, "duration") && b !== null) return scaleDuration(left, b);
  if (isKind(right, "duration") && a !== null) return scaleDuration(right, a);
  return a !== null && b !== null ? a * b : cannot("multiply", left, right);
}

function divide(left: BaseValue, right: BaseValue, remainder: boolean): BaseValue {
  if (left === null || right === null) return null;
  const action = remainder ? "take the remainder of" : "divide";
  const b = isKind(right, "duration") ? durationMs(right) : numericValue(right);
  if (b === 0) return errorValue("Cannot divide by zero");

  if (isKind(left, "duration") && !remainder) {
    if (isKind(right, "duration")) return durationMs(left) / durationMs(right);
    return b !== null ? scaleDuration(left, 1 / b) : cannot(action, left, right);
  }
  const a = numericValue(left);
  if (a === null || b === null || isKind(right, "duration")) return cannot(action, left, right);
  return remainder ? a % b : a / b;
}

function binary(node: Extract<Expr, { type: "binary" }>, scope: Scope): BaseValue {
  const { operator } = node;

  if (operator === "&&" || operator === "||") {
    const left = evalNode(node.left, scope);
    if (isError(left)) return left;
    // The right side is not run when the left side already decides the answer.
    if (isTruthy(left) === (operator === "||")) return operator === "||";
    const right = evalNode(node.right, scope);
    return isError(right) ? right : isTruthy(right);
  }

  const left = evalNode(node.left, scope);
  if (isError(left)) return left;
  const right = evalNode(node.right, scope);
  if (isError(right)) return right;

  switch (operator) {
    case "==":
      return looseEquals(left, right, scope.env.links);
    case "!=":
      return !looseEquals(left, right, scope.env.links);
    case "+":
      return add(left, right);
    case "-":
      return subtract(left, right);
    case "*":
      return multiply(left, right);
    case "/":
      return divide(left, right, false);
    case "%":
      return divide(left, right, true);
    default: {
      // A missing value is not a mistake: a note with no price is simply not "> 5".
      if (left === null || right === null) return false;
      const order = compareOrdered(left, right);
      if (order === null) return cannot("compare", left, right);
      if (operator === "<") return order < 0;
      if (operator === "<=") return order <= 0;
      if (operator === ">") return order > 0;
      return order >= 0;
    }
  }
}

/** Evaluate arguments in order, stopping at the first error. */
function evalAll(nodes: Expr[], scope: Scope): BaseValue[] | ErrorValue {
  const values: BaseValue[] = [];
  for (const node of nodes) {
    const value = evalNode(node, scope);
    if (isError(value)) return value;
    values.push(value);
  }
  return values;
}

function wrongCount(name: string, wants: string, count: number): ErrorValue {
  return errorValue(`${name}() takes ${wants}, not ${count}`);
}

/** `filter()`, `map()` and `reduce()`: the argument is run once for each element. */
function listCall(list: BaseValue[], name: string, args: Expr[], scope: Scope): BaseValue {
  const inner = (locals: Record<string, BaseValue>): Scope => ({
    env: scope.env,
    row: scope.row,
    locals: { ...scope.locals, ...locals },
  });

  if (name === "reduce") {
    if (args.length !== 2) return wrongCount(name, "2 arguments", args.length);
    let acc = evalNode(args[1], scope);
    for (let index = 0; index < list.length && !isError(acc); index++) {
      acc = evalNode(args[0], inner({ value: list[index], index, acc }));
    }
    return acc;
  }

  if (args.length !== 1) return wrongCount(name, "1 argument", args.length);
  const result: BaseValue[] = [];
  for (let index = 0; index < list.length; index++) {
    const value = evalNode(args[0], inner({ value: list[index], index }));
    if (isError(value)) return value;
    if (name === "map") result.push(value);
    else if (isTruthy(value)) result.push(list[index]);
  }
  return result;
}

function call(node: Extract<Expr, { type: "call" }>, scope: Scope): BaseValue {
  const { callee, args } = node;

  if (callee.type === "identifier") {
    const name = callee.name;
    if (name === "if") {
      if (args.length < 2 || args.length > 3) return wrongCount(name, "2 to 3 arguments", args.length);
      const condition = evalNode(args[0], scope);
      if (isError(condition)) return condition;
      // Only the chosen branch runs, so the other one may fail for this row.
      if (isTruthy(condition)) return evalNode(args[1], scope);
      return args.length === 3 ? evalNode(args[2], scope) : null;
    }
    if (!isGlobalFunction(name)) return errorValue(`There is no function called ${name}()`);
    const values = evalAll(args, scope);
    return Array.isArray(values) ? callGlobal(name, values, scope.env) : values;
  }

  if (callee.type === "member") {
    const self = evalNode(callee.object, scope);
    if (isError(self)) return self;
    if (Array.isArray(self) && LAZY_LIST_METHODS.includes(callee.property)) {
      return listCall(self, callee.property, args, scope);
    }
    const values = evalAll(args, scope);
    return Array.isArray(values) ? callMethod(self, callee.property, values, scope.env) : values;
  }

  return errorValue("Only a function can be called");
}

function evalNode(node: Expr, scope: Scope): BaseValue {
  switch (node.type) {
    case "literal":
      return node.value;
    case "regexp":
      return { kind: "regexp", source: node.source, flags: node.flags };
    case "identifier":
      return identifier(node.name, scope);
    case "list":
      return evalAll(node.items, scope);
    case "object": {
      const entries: [string, BaseValue][] = [];
      for (const entry of node.entries) {
        const value = evalNode(entry.value, scope);
        if (isError(value)) return value;
        entries.push([entry.key, value]);
      }
      return objectValue(entries);
    }
    case "member": {
      const namespace = namespaceOf(node.object, scope);
      if (namespace) return readNamespace(namespace, node.property, scope);
      return readField(evalNode(node.object, scope), node.property, scope.env);
    }
    case "index": {
      const namespace = namespaceOf(node.object, scope);
      if (namespace) {
        const key = evalNode(node.index, scope);
        if (isError(key)) return key;
        if (typeof key !== "string" && typeof key !== "number") {
          return errorValue(`A property name must be text, not ${typeLabel(key)}`);
        }
        return readNamespace(namespace, String(key), scope);
      }
      const object = evalNode(node.object, scope);
      if (isError(object)) return object;
      const key = evalNode(node.index, scope);
      if (isError(key)) return key;
      return readIndex(object, key, scope.env);
    }
    case "call":
      return call(node, scope);
    case "unary": {
      const operand = evalNode(node.operand, scope);
      if (isError(operand)) return operand;
      if (node.operator === "!") return !isTruthy(operand);
      if (operand === null) return null;
      if (isKind(operand, "duration")) return scaleDuration(operand, -1);
      const n = numericValue(operand);
      return n !== null ? -n : errorValue(`Cannot negate ${typeLabel(operand)}`);
    }
    case "binary":
      return binary(node, scope);
  }
}

/** Evaluate a parsed expression. Never throws. */
export function evaluate(expr: Expr, scope: Scope): BaseValue {
  try {
    return evalNode(expr, scope);
  } catch (problem) {
    // Reached only by something like a stack overflow in a huge expression.
    const detail = problem instanceof RangeError ? "it is too deeply nested" : String(problem);
    return errorValue(`The expression could not be evaluated: ${detail}`);
  }
}

/** Parse and evaluate. A syntax error comes back as an error value. */
export function evaluateSource(source: string, scope: Scope): BaseValue {
  const compiled = compileExpression(source);
  return compiled.ok ? evaluate(compiled.expr, scope) : errorValue(compiled.error);
}

export interface EvaluateOptions extends EnvOptions {
  /** The files links are looked up in. Defaults to the one row. */
  rows?: NoteRow[];
  /** Formulas the expression may refer to as `formula.name`. */
  formulas?: Record<string, string>;
}

/**
 * Evaluate one expression against one row, outside any view. For a formula
 * editor's preview, and for trying an expression in a test.
 */
export function evaluateExpression(
  source: string,
  row: NoteRow | null = null,
  options: EvaluateOptions = {},
): BaseValue {
  const rows = options.rows ?? (row ? [row] : []);
  const env = createEnv(rows, options.formulas, options);
  return evaluateSource(source, { env, row, locals: null });
}
