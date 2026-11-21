const { withAndroidManifest } = require('expo/config-plugins');

const FEATURE = 'android.hardware.screen.portrait';

// The app is locked to portrait (`orientation` in app.json), and Google Play
// reads a portrait-only activity as "needs a screen that can be held
// upright". Devices that do not report such a screen, some tablets,
// Chromebooks and desktop or headset modes among them, are then not offered
// the app at all, and Play Console holds a release back with "Required
// hardware feature declarations are restricting your app's availability".
//
// Saying outright that the feature is not required lifts that filter. The
// app stays locked to portrait where the device can do it; elsewhere the
// system shows it in a portrait-shaped window.
function withOptionalPortrait(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const features = (manifest['uses-feature'] ??= []);
    const declared = features.find((feature) => feature.$?.['android:name'] === FEATURE);
    if (declared) {
      declared.$['android:required'] = 'false';
    } else {
      features.push({ $: { 'android:name': FEATURE, 'android:required': 'false' } });
    }
    return config;
  });
}

module.exports = withOptionalPortrait;
