/**
 * Template engine for Noteriv.
 *
 * Templates are regular .md files stored in a `Templates/` folder within the vault.
 * Template variables (e.g. {{date}}, {{title}}) are replaced at insertion time.
 */

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Build a map of all built-in template variables for the current moment.
 */
export function getTemplateVariables(noteTitle: string): Record<string, string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");

  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${min}`,
    title: noteTitle,
    datetime: now.toISOString(),
    weekday: DAYS[now.getDay()],
    month: MONTHS[now.getMonth()],
    year: yyyy,
  };
}

/**
 * Replace `{{variable}}` placeholders in template content.
 * Matching is case-insensitive and tolerates whitespace around the variable name
 * (e.g. `{{ date }}` works as well as `{{date}}`).
 */
export function processTemplate(
  content: string,
  variables: Record<string, string>,
): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const lower = key.toLowerCase();
    if (lower in variables) return variables[lower];
    return match; // leave unknown variables untouched
  });
}

/**
 * List every `.md` file inside the vault's `Templates/` directory.
 * Returns an empty array when the directory does not exist.
 */
export async function listTemplates(
  vaultPath: string,
): Promise<{ name: string; path: string }[]> {
  if (!window.electronAPI) return [];

  const templatesDir = `${vaultPath}/Templates`;

  try {
    const entries = await window.electronAPI.readDir(templatesDir);
    return entries
      .filter((e) => !e.isDirectory && /\.(md|markdown)$/i.test(e.name))
      .map((e) => ({
        name: e.name.replace(/\.(md|markdown)$/i, ""),
        path: e.path,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Read the raw content of a template file.
 */
export async function loadTemplate(templatePath: string): Promise<string> {
  if (!window.electronAPI) return "";
  const content = await window.electronAPI.readFile(templatePath);
  return content ?? "";
}
