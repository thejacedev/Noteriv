# Android WebDAV client certificates

`withAndroidClientCertificates` registers the OkHttp factory before React Native starts. The local Expo module lets `http.android.ts` detect native support, including falling back to ordinary Expo fetch in Expo Go.

Only WebDAV requests carry the internal certificate-policy header. The factory strips that header and routes those requests through a per-origin OkHttp client. Separate pools and TLS contexts prevent other requests or other origins from reusing client-authenticated connections. Redirects and cookies remain disabled. The outer Expo call's cancellation reaches both the TLS handshake and response-body reads.

The key manager opens Android's KeyChain picker only for user-initiated sync. Aliases persist per hostname/port; keys remain in KeyChain. Invalid local selections are discarded, and recognized TLS certificate-rejection alerts allow one manual retry. HTTP authentication failures and ordinary network failures do not trigger certificate reselection.

The implementation relies on OkHttp 4 performing synchronous-call TLS callbacks on the calling thread. Recheck that assumption when upgrading React Native's OkHttp dependency.

Run the native TLS tests after `npx expo prebuild --platform android --no-install`:

```sh
cd android
./gradlew :webdav-certificates:testDebugUnitTest
```

The tests use real mutual-TLS connections and a Robolectric KeyChain stand-in. Verify the actual system picker on an Android device with an installed client identity before release.
