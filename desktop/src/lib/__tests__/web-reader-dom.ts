/**
 * A stand-in for the browser's `DOMParser`, for the web reader's tests.
 *
 * The tests run in Node, which has no DOM, and the project has no DOM package
 * to borrow one from. The reader reads very little from a parsed page: each
 * node's `nodeType`, `nodeName`, `nodeValue`, `attributes` and `childNodes`,
 * and the document's `documentElement`. This gives it exactly that, for the
 * tidy HTML the tests are written in.
 *
 * It is not an HTML parser to rely on anywhere else. It does not repair
 * broken markup the way a browser does: every element in a test page has to
 * be closed by hand.
 */

interface TinyNode {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  attributes: { name: string; value: string }[];
  childNodes: TinyNode[];
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Elements whose contents are text up to their closing tag, whatever it looks like. */
const RAW_TEXT = new Set(["script", "style", "title", "textarea"]);

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", eacute: "é",
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[name] ?? whole;
  });
}

const element = (name: string): TinyNode => ({
  nodeType: 1,
  // Upper case, as a browser reports the name of an HTML element.
  nodeName: name.toUpperCase(),
  nodeValue: null,
  attributes: [],
  childNodes: [],
});

const text = (value: string, type = 3): TinyNode => ({
  nodeType: type,
  nodeName: type === 3 ? "#text" : "#comment",
  nodeValue: value,
  attributes: [],
  childNodes: [],
});

function parse(html: string): TinyNode[] {
  const top = element("#top");
  const open: TinyNode[] = [top];
  const current = () => open[open.length - 1];
  const tagPattern = /<!--([\s\S]*?)-->|<!doctype[^>]*>|<\/([a-z][a-z0-9-]*)\s*>|<([a-z][a-z0-9-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))?)*)\s*(\/?)>/gi;

  let at = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    if (match.index > at) current().childNodes.push(text(decode(html.slice(at, match.index))));
    at = tagPattern.lastIndex;

    const [, comment, closing, opening, attributeText] = match;
    if (comment !== undefined) {
      current().childNodes.push(text(comment, 8));
    } else if (closing) {
      const name = closing.toUpperCase();
      const depth = open.map((node) => node.nodeName).lastIndexOf(name);
      if (depth > 0) open.length = depth;
    } else if (opening) {
      const node = element(opening);
      for (const attr of attributeText.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g)) {
        node.attributes.push({ name: attr[1].toLowerCase(), value: decode(attr[2] ?? attr[3] ?? attr[4] ?? "") });
      }
      current().childNodes.push(node);

      const name = opening.toLowerCase();
      if (RAW_TEXT.has(name)) {
        const end = html.toLowerCase().indexOf(`</${name}`, at);
        const stop = end === -1 ? html.length : end;
        const inside = html.slice(at, stop);
        if (inside) node.childNodes.push(text(name === "script" || name === "style" ? inside : decode(inside)));
        const close = html.indexOf(">", stop);
        at = close === -1 ? html.length : close + 1;
        tagPattern.lastIndex = at;
      } else if (!VOID.has(name)) {
        open.push(node);
      }
    }
  }
  if (at < html.length) current().childNodes.push(text(decode(html.slice(at))));
  return top.childNodes;
}

/** `new DOMParser().parseFromString(html, "text/html")`, as far as the reader needs it. */
export class TinyDOMParser {
  parseFromString(html: string): { documentElement: TinyNode } {
    const nodes = parse(html);
    const root = nodes.find((node) => node.nodeName === "HTML");
    if (root) return { documentElement: root };
    // A piece of a page rather than a whole one: a browser puts it in a body.
    const documentElement = element("html");
    const body = element("body");
    body.childNodes = nodes;
    documentElement.childNodes = [element("head"), body];
    return { documentElement };
  }
}
