// The least a web page has to be for react-dom to mount a tree that draws
// nothing. It lets a test run the app's state (context/AppContext.tsx) with
// real React: effects, timers and renders behave as they do on the phone.
// Import this before react-dom.
const events = { addEventListener() {}, removeEventListener() {} };
const element = () => ({
  ...events, nodeType: 1, style: {},
  setAttribute() {}, removeAttribute() {}, appendChild() {}, removeChild() {},
});

const page = { ...events, nodeType: 9, defaultView: globalThis, createElement: element, activeElement: null };
page.documentElement = element();
page.body = element();

globalThis.document = page;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};
// Lets React's act() run renders and effects to completion inside a test.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Something for createRoot() to mount into. */
export function container() {
  return {
    ...element(), tagName: 'DIV', nodeName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: page, childNodes: [], firstChild: null, lastChild: null, textContent: '',
    insertBefore() {},
  };
}
