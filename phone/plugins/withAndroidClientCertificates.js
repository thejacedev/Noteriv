const { withMainApplication } = require('expo/config-plugins');

const INSTALL = 'expo.modules.webdavcertificates.WebDavCertificates.install(this)';

function withAndroidClientCertificates(config) {
  return withMainApplication(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('withAndroidClientCertificates requires a Kotlin MainApplication.');
    }
    const source = config.modResults.contents;
    if (source.includes(INSTALL)) {
      return config;
    }
    const anchor = /override fun onCreate\(\) \{\s*super\.onCreate\(\)/;
    if (!anchor.test(source)) {
      throw new Error('withAndroidClientCertificates: MainApplication.onCreate anchor not found.');
    }
    config.modResults.contents = source.replace(anchor, (match) => `${match}\n    ${INSTALL}`);
    return config;
  });
}

module.exports = withAndroidClientCertificates;
