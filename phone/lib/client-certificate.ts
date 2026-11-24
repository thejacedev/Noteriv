/**
 * Client certificates for WebDAV sync (Android).
 *
 * Some servers ask for more than a password: they only talk to a device that
 * shows a certificate they know. The certificate is installed in the phone's
 * own settings; a vault remembers the name of the one to show.
 *
 * A vault with a certificate sends its WebDAV requests through connections
 * that belong to that one server and show that one certificate. Everything
 * else the app does on the network, and every vault without a certificate,
 * goes the way it always went and can show nobody a certificate.
 */
import * as Native from '@/lib/client-certificate-native';

/** A server: the name and port a certificate is shown to. */
export interface Endpoint {
  host: string;
  port: number;
}

/** What sync asks of a request; the app's ordinary fetch takes the same. */
export interface SentRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array | null;
  signal?: AbortSignal | null;
  [other: string]: unknown;
}

/** What sync reads of an answer; the app's ordinary fetch gives the same. */
export interface Answer {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type Fetch = (url: string, init?: SentRequest) => Promise<Answer>;

/** Something is wrong with the certificate itself. The message says what to do about it. */
export class ClientCertificateProblem extends Error {}

const WHERE = 'Settings > WebDAV Sync > Client certificate';

export const NONE_CHOSEN = `The server asks for a client certificate, and none is chosen for this vault. Choose one under ${WHERE}.`;

export function goneMessage(alias: string): string {
  return `The client certificate "${alias}" is no longer on this phone, or this app may no longer use it. Choose it again under ${WHERE}.`;
}

export function refusedMessage(alias: string, reason: string): string {
  return `The server did not accept the client certificate "${alias}" (${reason}). Check that it is the right one and has not expired, or choose another under ${WHERE}.`;
}

/** Whether this device can show a client certificate at all. Only Android can. */
export function supported(): boolean {
  return Native.supported();
}

/**
 * The server a WebDAV address leads to, or null when the address cannot be
 * read or is not https (a certificate is only ever shown over https).
 */
export function endpointOf(url: string): Endpoint | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) return null;
  const port = parsed.port === '' ? 443 : Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: parsed.hostname.toLowerCase(), port };
}

/**
 * Opens the phone's list of installed certificates for the server at
 * `address`. Gives the name of the one that was picked, or null when the
 * list was closed without a choice (also when no certificate is installed).
 */
export async function choose(address: string, current: string | null): Promise<string | null> {
  const endpoint = endpointOf(address);
  const picked = await Native.choose(endpoint?.host ?? null, endpoint?.port ?? -1, current);
  return typeof picked === 'string' && picked !== '' ? picked : null;
}

/** Drops the connections that showed a certificate, for example when a vault is disconnected. */
export function forget(): Promise<void> {
  return Native.forget().catch(() => undefined);
}

/**
 * Stops a sync before it starts when the vault's certificate cannot be used
 * any more: it was removed from the phone, or the app's permission for it was
 * taken back. Without this the server would only be seen to hang up.
 */
export async function ensureUsable(alias: string | null | undefined): Promise<void> {
  if (!alias || !Native.supported()) return;
  let available: boolean;
  try {
    available = (await Native.describe(alias)).available === true;
  } catch {
    available = false;
  }
  if (!available) {
    await forget();
    throw new ClientCertificateProblem(goneMessage(alias));
  }
}

/**
 * Whether the server at `address` asks its visitors for a client
 * certificate. One short connection that shows none; false when that cannot
 * be found out.
 */
export async function serverAsks(address: string): Promise<boolean> {
  const endpoint = endpointOf(address);
  if (!endpoint || !Native.supported()) return false;
  try {
    return (await Native.probe(endpoint.host, endpoint.port)).asked === true;
  } catch {
    return false;
  }
}

let nextRequest = 0;

function bytesOf(body: string | Uint8Array | null | undefined): Uint8Array | null {
  if (body === null || body === undefined) return null;
  return typeof body === 'string' ? new TextEncoder().encode(body) : body;
}

/** The bytes of an answer, whichever way the native side handed them over. */
function bodyOf(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(0);
}

/**
 * A fetch that shows the certificate `alias` to the server at `address`, and
 * to no other: a request for a different server is refused before any
 * connection is made. Null when there is no certificate to show, the device
 * cannot show one, or the address is not an https one.
 *
 * Like every WebDAV request it follows no redirect and keeps no cookies.
 */
export function certificateFetch(address: string, alias: string | null | undefined): Fetch | null {
  if (!alias || !Native.supported()) return null;
  const endpoint = endpointOf(address);
  if (!endpoint) return null;

  return async (url, init = {}) => {
    const target = endpointOf(url);
    if (!target || target.host !== endpoint.host || target.port !== endpoint.port) {
      throw new ClientCertificateProblem('The request was not sent: it is for another server than the one the client certificate was chosen for.');
    }
    const signal = init.signal ?? null;
    const aborted = () => Object.assign(new Error('The request was cancelled.'), { name: 'AbortError' });
    if (signal?.aborted) throw aborted();

    const id = `certificate-${Date.now()}-${nextRequest++}`;
    const onAbort = () => {
      Native.cancel(id).catch(() => undefined);
    };
    signal?.addEventListener('abort', onAbort);
    try {
      const answer = await Native.request(
        { id, alias, host: endpoint.host, port: endpoint.port, method: (init.method ?? 'GET').toUpperCase(), url, headers: { ...init.headers } },
        bytesOf(init.body),
      );
      const bytes = bodyOf(answer.body);
      const headers = answer.headers ?? {};
      return {
        status: answer.status,
        headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
        text: async () => new TextDecoder().decode(bytes),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      };
    } catch (error) {
      if (signal?.aborted) throw aborted();
      const code = (error as { code?: unknown } | null)?.code;
      const reason = error instanceof Error ? error.message : String(error);
      if (code === 'ERR_CLIENT_CERT_UNAVAILABLE') {
        await forget();
        throw new ClientCertificateProblem(goneMessage(alias));
      }
      if (code === 'ERR_CLIENT_CERT_REFUSED') throw new ClientCertificateProblem(refusedMessage(alias, reason));
      if (code === 'ERR_CLIENT_CERT_WRONG_SERVER') throw new ClientCertificateProblem(reason);
      throw new Error(reason);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  };
}
