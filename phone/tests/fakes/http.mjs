// Stand-in for lib/http.ts (Expo's fetch on a phone): the ordinary fetch,
// looked up at each call so a test can put a stand-in server in its place.
export const fetch = (input, init) => globalThis.fetch(input, init);
