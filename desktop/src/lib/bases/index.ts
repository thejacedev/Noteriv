/**
 * Bases: database views over the notes of a vault, compatible with
 * Obsidian's `.base` files. This is the engine only. It is given the rows
 * and the text of a base, and returns what a view should show; it reads no
 * files and draws nothing.
 *
 *   const parsed = parseBase(text);
 *   if (parsed.ok) {
 *     const result = runView(parsed.base, "My table", rows, { thisFile });
 *     // result.columns, result.rows[i].cells[column.id], result.groups, result.summaries
 *   }
 */

export {
  normalizePropertyId,
  parseBase,
  parsePropertyId,
  type BaseFile,
  type BaseView,
  type FilterNode,
  type ParseBaseResult,
  type PropertyConfig,
  type PropertyRef,
  type PropertySource,
  type SortDirection,
  type SortSpec,
} from "./base-file";
export { compareForSort, looseEquals } from "./compare";
export { fromRaw } from "./convert";
export { csvField, toCsv, type CsvOptions } from "./csv";
export { formatDate, formatDuration, parseDateText, parseDuration, relativeTime } from "./dates";
export { FILE_FIELDS, type EnvOptions } from "./environment";
export { evaluateExpression, type EvaluateOptions } from "./evaluate";
export { parseExpression, type Expr, type ParseResult } from "./expression";
export { formatValue, type FormatOptions } from "./format";
export { SUPPORTED_FUNCTIONS, UNSUPPORTED_FUNCTIONS } from "./functions";
export { makeNoteRow, type NoteRowInput } from "./rows";
export { BUILT_IN_SUMMARIES, builtInSummary, type BuiltInSummary } from "./summaries";
export {
  errorValue,
  isEmptyValue,
  isError,
  isKind,
  isTruthy,
  typeOf,
  type BaseValue,
  type BaseValueType,
  type DateValue,
  type DurationValue,
  type ErrorValue,
  type FileValue,
  type HtmlValue,
  type IconValue,
  type ImageValue,
  type LinkValue,
  type NoteFile,
  type NoteRow,
  type ObjectValue,
  type RegExpValue,
  type TagValue,
  type TaggedValue,
  type UrlValue,
} from "./values";
export {
  DEFAULT_VIEW,
  VIEW_TYPES,
  runView,
  type RunViewOptions,
  type ViewColumn,
  type ViewGroup,
  type ViewProblem,
  type ViewResult,
  type ViewRow,
  type ViewSummary,
  type ViewType,
} from "./view";
