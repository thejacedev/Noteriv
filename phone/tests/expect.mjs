// The few vitest matchers the desktop's tests use, on top of node:assert, so
// the phone can run the same checks without a test framework.
import assert from 'node:assert/strict';

/** Every key the expected value names must match; a list must match item by item. */
function assertMatches(actual, expected, where) {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${where} is not a list`);
    assert.strictEqual(actual.length, expected.length, `${where} has another length`);
    expected.forEach((item, i) => assertMatches(actual[i], item, `${where}[${i}]`));
  } else if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object', `${where} is not an object`);
    for (const key of Object.keys(expected)) assertMatches(actual[key], expected[key], `${where}.${key}`);
  } else {
    assert.strictEqual(actual, expected, where);
  }
}

export const expect = (actual) => ({
  toBe: (expected) => assert.strictEqual(actual, expected),
  toBeNull: () => assert.strictEqual(actual, null),
  toEqual: (expected) => assert.deepStrictEqual(actual, expected),
  toContain: (expected) => assert.ok(actual.includes(expected), `${JSON.stringify(actual)} does not contain ${JSON.stringify(expected)}`),
  toMatchObject: (expected) => assertMatches(actual, expected, 'value'),
});
