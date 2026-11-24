import { requireOptionalNativeModule } from 'expo';
import { fetch as expoFetch } from 'expo/fetch';

const hasClientCertificates = requireOptionalNativeModule('WebDavCertificates') !== null;

export function fetch(input: string, init: RequestInit, options: { canPromptForCertificate: boolean }) {
  const headers = new Headers(init.headers);
  if (hasClientCertificates) {
    headers.set('X-Noteriv-WebDAV-Certificate', options.canPromptForCertificate ? 'interactive' : 'cached');
  }
  return expoFetch(input, { ...init, headers });
}
