// Turns one of the desktop's vitest files into a node:test file for the phone.
//
// The phone keeps its own copies of a few of the desktop's modules (the board
// reader and writer, the properties code), because both apps rewrite the same
// files in a vault and must do it the same way. When such a module changes on
// the desktop: copy the file over, then run this on its test file, so the
// phone runs the same checks:
//
//   node scripts/port-desktop-test.mjs ../desktop/src/lib/__tests__/board-utils.test.ts tests/board-utils.test.mjs
//
// It handles test files that import { describe, expect, it } from vitest and
// one module from "../<name>", and the matchers in tests/expect.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node scripts/port-desktop-test.mjs <desktop test file> <phone test file>');
  process.exit(1);
}

let code = ts.transpileModule(readFileSync(src, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: false },
}).outputText;

const importRe = /import \{ describe, expect, it \} from "vitest";\nimport \{([^}]+)\} from "\.\.\/([a-z-]+)";\n/;
const found = code.match(importRe);
if (!found) {
  console.error(`${src}: expected an import from vitest followed by one from "../<module>"`);
  process.exit(1);
}
const names = found[1].split(',').map((name) => name.trim()).filter(Boolean);
const header = [
  `// The same checks the desktop runs on its copy of lib/${found[2]}.ts`,
  `// (${src.replace(/^.*desktop\//, 'desktop/')}). Both apps rewrite the same`,
  '// files, so they have to read and write them the same way.',
  '// Made by scripts/port-desktop-test.mjs: change the desktop file and run it again.',
  "import { describe, it } from 'node:test';",
  '',
  `import {\n${names.map((name) => `  ${name},`).join('\n')}\n} from '@/lib/${found[2]}';`,
  '',
  "import { expect } from './expect.mjs';",
  '',
].join('\n');

// TypeScript prints four spaces; the phone's files use two.
code = code.replace(importRe, header).replace(/^( {4})+/gm, (indent) => ' '.repeat(indent.length / 2));
writeFileSync(out, code);
