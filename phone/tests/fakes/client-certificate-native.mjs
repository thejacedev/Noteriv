// Stand-in for lib/client-certificate-native.ts (the Android module that
// reads the phone's store of client certificates).
//
// A test turns it on with `phone.supported = true`, "installs" certificates
// by name, and can look at every request that was sent with one. Requests
// are passed on to the ordinary fetch, so a stand-in server answers them the
// way it answers every other request; the name of the certificate that was
// shown travels along in a header only this stand-in adds.
export const SHOWN = 'x-test-client-certificate';

export const phone = {
  /** Whether this "device" has the module at all (an iPhone has not). */
  supported: false,
  /** Names of the certificates installed on the phone that the app may use. */
  installed: new Set(),
  /** What the system's list answers the next time it is opened. */
  nextChoice: null,
  /** Every time the list was opened: { host, port, current }. */
  chooserOpened: [],
  /** host:port of servers that ask for a client certificate. */
  asking: new Set(),
  /** Every probe: "host:port". */
  probes: [],
  /** Every request sent with a certificate. */
  requests: [],
  /** Ids of requests that were cancelled. */
  cancelled: [],
  /** How often the certificate connections were dropped. */
  forgotten: 0,
  /** When set, the next request fails with this (an Error, with a `code` for the coded ones). */
  failNext: null,
  /** When set, a request waits for this promise before it goes on (a slow server). */
  gate: null,
};

export function reset() {
  phone.supported = false;
  phone.installed = new Set();
  phone.nextChoice = null;
  phone.chooserOpened = [];
  phone.asking = new Set();
  phone.probes = [];
  phone.requests = [];
  phone.cancelled = [];
  phone.forgotten = 0;
  phone.failNext = null;
  phone.gate = null;
}

const coded = (code, message) => Object.assign(new Error(message), { code });

export function supported() {
  return phone.supported;
}

export async function choose(host, port, current) {
  phone.chooserOpened.push({ host, port, current });
  return phone.nextChoice;
}

export async function describe(alias) {
  const available = phone.installed.has(alias);
  return { available, subject: available ? `CN=${alias}` : null, issuer: available ? 'CN=Test CA' : null, expires: available ? 4102444800000 : null };
}

export async function request(options, body) {
  phone.requests.push({ ...options, body });
  if (phone.gate) await phone.gate;
  if (phone.failNext) {
    const error = phone.failNext;
    phone.failNext = null;
    throw error;
  }
  const url = new URL(options.url);
  const port = url.port === '' ? 443 : Number(url.port);
  if (url.hostname !== options.host || port !== options.port) {
    throw coded('ERR_CLIENT_CERT_WRONG_SERVER', 'The request is not for the server this certificate was chosen for.');
  }
  if (!phone.installed.has(options.alias)) {
    throw coded('ERR_CLIENT_CERT_UNAVAILABLE', `The certificate "${options.alias}" could not be read from this phone.`);
  }
  const response = await globalThis.fetch(options.url, {
    method: options.method,
    headers: { ...options.headers, [SHOWN]: options.alias },
    body: body ?? undefined,
    redirect: 'manual',
  });
  const headers = {};
  response.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  return { status: response.status, headers, body: new Uint8Array(await response.arrayBuffer()) };
}

export async function cancel(id) {
  phone.cancelled.push(id);
}

export async function probe(host, port) {
  phone.probes.push(`${host}:${port}`);
  return { asked: phone.asking.has(`${host}:${port}`) };
}

export async function forget() {
  phone.forgotten += 1;
}
