/**
 * Applies a base's filters to a row. A statement that fails does not stop
 * the view: it counts as unknown, and the row is kept or dropped by the
 * statements around it wherever they can decide on their own.
 */

import type { FilterNode } from "./base-file";
import { evaluateSource, type Scope } from "./evaluate";
import { isError, isTruthy, type ErrorValue } from "./values";

/** A statement that failed for some row, for the view to report. */
export interface FilterFailure {
  /** The statement as written. */
  statement: string;
  message: string;
}

/**
 * Whether a row passes: true, false, or the error of a statement that
 * failed. `or` is still true when another statement is true, and `and`
 * still false when another is false; otherwise the error decides, and the
 * caller drops the row.
 */
export function testFilter(
  node: FilterNode,
  scope: Scope,
  onFailure?: (failure: FilterFailure) => void,
): boolean | ErrorValue {
  if (typeof node === "string") {
    const value = evaluateSource(node, scope);
    if (!isError(value)) return isTruthy(value);
    onFailure?.({ statement: node, message: value.message });
    return value;
  }

  const children = "and" in node ? node.and : "or" in node ? node.or : node.not;
  // A group with nothing in it filters nothing, whichever kind it is.
  if (children.length === 0) return true;
  // What settles the group at once: a false statement for "and", a true one otherwise.
  const decisive = !("and" in node);
  let failure: ErrorValue | null = null;

  for (const child of children) {
    const result = testFilter(child, scope, onFailure);
    if (isErrorResult(result)) failure ??= result;
    else if (result === decisive) return "or" in node;
  }
  if (failure) return failure;
  // Nothing decisive: all true for "and", none true for "or" and "not".
  return !("or" in node);
}

function isErrorResult(result: boolean | ErrorValue): result is ErrorValue {
  return typeof result !== "boolean";
}
