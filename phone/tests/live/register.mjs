// The loader for the tests that sync with a real server: the app's sources
// as in tests/register.mjs, with vaults kept on a real disk.
process.env.NOTERIV_LIVE = '1';
await import('../register.mjs');
