/**
 * The fetch WebDAV sync goes through.
 *
 * It is Expo's own fetch rather than React Native's: it hands a file's bytes
 * to and from the system's network stack as they are, where React Native's
 * turns a download into text and back. Request types that only WebDAV has
 * (`PROPFIND`, `MKCOL`) go out under their own names on both systems.
 *
 * It lives in a file of its own so the tests, which do not run on a phone,
 * can put the ordinary fetch in its place.
 */
export { fetch } from 'expo/fetch';
