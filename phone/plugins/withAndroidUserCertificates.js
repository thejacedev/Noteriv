const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const RESOURCE = 'network_security_config';

// An Android app that targets API 24 or later trusts only the certificate
// authorities that ship with the system. A CA the user installs themselves
// (Settings > Security > Install a certificate) is ignored, so a self-hosted
// GitLab, Gitea or Forgejo behind a private or company CA can never be
// reached: every request fails with "Network request failed", and nothing the
// user does on the phone changes that. The desktop app has no such limit,
// because git there reads the system store the user can add to.
//
// This plugin adds a network security config that trusts the user's CAs next
// to the system ones. It does not allow plain http and it does not skip
// certificate checks: a server still has to present a chain that ends in a CA
// the owner of the phone chose to install.
//
// A network security config makes Android ignore `usesCleartextTraffic`, which
// the debug manifests set so a development build can load its bundle from
// Metro over http. The debug build types therefore get their own copy that
// keeps plain http allowed, exactly as it was before. Release stays https only.
function configXml({ cleartext }) {
  const base = cleartext ? '<base-config cleartextTrafficPermitted="true">' : '<base-config>';
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    ${base}
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;
}

const VARIANTS = [
  { sourceSet: 'main', cleartext: false },
  { sourceSet: 'debug', cleartext: true },
  { sourceSet: 'debugOptimized', cleartext: true },
];

function withAndroidUserCertificates(config) {
  config = withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.$['android:networkSecurityConfig'] = `@xml/${RESOURCE}`;
    return config;
  });

  return withDangerousMod(config, [
    'android',
    (config) => {
      const src = path.join(config.modRequest.platformProjectRoot, 'app', 'src');
      for (const { sourceSet, cleartext } of VARIANTS) {
        const dir = path.join(src, sourceSet, 'res', 'xml');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${RESOURCE}.xml`), configXml({ cleartext }));
      }
      return config;
    },
  ]);
}

module.exports = withAndroidUserCertificates;
