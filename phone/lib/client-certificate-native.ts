/**
 * The phone's own store of client certificates, and the requests that show
 * one to a server.
 *
 * This is the door to the native code in `modules/noteriv-client-certificate`,
 * which exists on Android only: there a certificate is installed in the
 * system's settings and an app has to ask the owner of the phone for it.
 * On iOS there is no such module and `supported()` says so.
 *
 * It lives in a file of its own so the tests, which do not run on a phone,
 * can put a stand-in in its place.
 */
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export interface CertificateInfo {
  /** Whether the certificate and its key can be read by this app right now. */
  available: boolean;
  subject: string | null;
  issuer: string | null;
  /** When it stops being valid, in milliseconds since 1970. */
  expires: number | null;
}

export interface NativeRequest {
  /** A name for the request, so it can be cancelled. */
  id: string;
  /** The certificate to show, by its name in the phone's store. */
  alias: string;
  /** The one server that may be shown the certificate. A request for another address is refused. */
  host: string;
  port: number;
  method: string;
  url: string;
  headers: Record<string, string>;
}

export interface NativeAnswer {
  status: number;
  /** Header names in lower case. */
  headers: Record<string, string>;
  body: Uint8Array;
}

interface NativeModule {
  choose(host: string | null, port: number, current: string | null): Promise<string | null>;
  describe(alias: string): Promise<CertificateInfo>;
  request(options: NativeRequest, body: Uint8Array | null): Promise<NativeAnswer>;
  cancel(id: string): Promise<void>;
  probe(host: string, port: number): Promise<{ asked: boolean }>;
  forget(): Promise<void>;
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeModule>('NoterivClientCertificate') : null;

function need(): NativeModule {
  if (!native) throw new Error('Client certificates are not available on this device.');
  return native;
}

/** Whether this device can show a client certificate at all. */
export function supported(): boolean {
  return native !== null;
}

/** Opens the system's list of installed certificates. Null when it was closed without a choice. */
export function choose(host: string | null, port: number, current: string | null): Promise<string | null> {
  return need().choose(host, port, current);
}

export function describe(alias: string): Promise<CertificateInfo> {
  return need().describe(alias);
}

export function request(options: NativeRequest, body: Uint8Array | null): Promise<NativeAnswer> {
  return need().request(options, body);
}

export function cancel(id: string): Promise<void> {
  return need().cancel(id);
}

/** Connects once without a certificate and says whether the server asked for one. */
export function probe(host: string, port: number): Promise<{ asked: boolean }> {
  return need().probe(host, port);
}

/** Drops the connections that showed a certificate. */
export function forget(): Promise<void> {
  return native ? native.forget() : Promise.resolve();
}
