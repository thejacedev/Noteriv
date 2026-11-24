// Lets `node --test` load the app's TypeScript sources without a bundler or a
// test framework. "@/..." imports resolve the way the app resolves them, the
// modules that only exist on a phone (the file system, key-value storage,
// Expo's fetch and the store of client certificates) are swapped for
// stand-ins, and .ts files are compiled
// with the TypeScript that is already a dev dependency. That covers .tsx
// too, so a component that needs no phone (context/AppContext.tsx) can be
// run as it is.
//
// Needs Node 22.15 or later, for module.registerHooks.
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fakes = {
  '@/lib/file-system': 'tests/fakes/file-system.mjs',
  '@/lib/storage': 'tests/fakes/storage.mjs',
  '@/lib/http': 'tests/fakes/http.mjs',
  '@/lib/client-certificate-native': 'tests/fakes/client-certificate-native.mjs',
};
// The tests against a real server (tests/live) keep their vaults on a real disk.
if (process.env.NOTERIV_LIVE) fakes['@/lib/file-system'] = 'tests/live/disk-file-system.mjs';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in fakes) {
      return { url: pathToFileURL(path.join(root, fakes[specifier])).href, shortCircuit: true };
    }
    if (specifier.startsWith('@/')) {
      const base = path.join(root, specifier.slice(2));
      const file = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((candidate) => existsSync(candidate));
      if (!file) throw new Error(`tests/register.mjs: nothing at ${specifier}`);
      return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    // A relative import without an extension, as lib/settings.ts has for './storage'.
    if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/.test(specifier) && context.parentURL?.startsWith('file:')) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      const alias = `@/${path.relative(root, base)}`;
      if (alias in fakes) return { url: pathToFileURL(path.join(root, fakes[alias])).href, shortCircuit: true };
      const file = [`${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith('.ts') && !url.endsWith('.tsx')) return nextLoad(url, context);
    const { outputText } = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  },
});
