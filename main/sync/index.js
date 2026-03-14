const folder = require("./folder");
const webdav = require("./webdav");

const providers = { folder, webdav };

async function performSync(vaultPath, providerType, config) {
  const provider = providers[providerType];
  if (!provider) throw new Error(`Unknown sync provider: ${providerType}`);
  return await provider.sync(vaultPath, config);
}

async function testConnection(providerType, config) {
  const provider = providers[providerType];
  if (!provider) return { ok: false, error: `Unknown provider: ${providerType}` };
  return await provider.testConnection(config);
}

module.exports = { performSync, testConnection };
