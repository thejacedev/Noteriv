/**
 * HTML sanitization for markup that reaches `innerHTML`.
 *
 * Note content is untrusted. A vault synchronizes from a Git remote, a WebDAV
 * share, a folder provider, the web clipper and the MCP server, so a note can
 * carry markup the user never wrote. Anything derived from note content has to
 * be sanitized before it is assigned to `innerHTML`, or the note becomes script
 * running with the privileges of the application window.
 */

import DOMPurify from "dompurify";

/** Elements that never appear in rendered markdown and can execute or embed. */
const FORBIDDEN_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "meta",
  "link",
];

/**
 * URL schemes a rendered note may reference.
 *
 * The renderer inlines local attachments as `data:` URLs (see
 * `renderers/images.ts`), so `data:` cannot simply be refused. It is narrowed to
 * media types instead, which keeps `data:text/html` — a navigable script
 * context — out while leaving embedded images, audio and video working.
 * `javascript:` matches nothing here and is dropped.
 */
const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|mailto|tel|blob):|data:(?:image|audio|video)\/|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

/**
 * Sanitize a fragment of HTML derived from note content.
 *
 * DOMPurify strips every `on*` event handler attribute, which is what closes
 * the injection path. The forbid list removes elements that are meaningless in
 * a rendered note but useful to an attacker.
 *
 * Note for callers: this parses the fragment in a neutral context, so markup
 * that is only valid inside a specific parent — a bare `<td>`, `<tr>` or
 * `<li>` — is unwrapped. Sanitize the complete element instead, or escape the
 * content before assembling it.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    FORBID_TAGS: FORBIDDEN_TAGS,
    // Belt and braces: DOMPurify already drops these, but naming them keeps the
    // intent visible if the default configuration ever changes.
    FORBID_ATTR: ["srcdoc", "formaction", "xlink:href"],
    ALLOWED_URI_REGEXP,
    // Keep rendered output as a fragment; never let a note supply <html>/<body>.
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}
