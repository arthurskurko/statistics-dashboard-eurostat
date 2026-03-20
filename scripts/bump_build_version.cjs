const fs = require('fs');
const path = require('path');

const buildConfigPath = path.resolve(__dirname, '..', 'build.config.json');

function readBuildConfig() {
  if (!fs.existsSync(buildConfigPath)) {
    return {};
  }

  const raw = fs.readFileSync(buildConfigPath, 'utf8');
  return JSON.parse(raw);
}

function main() {
  const config = readBuildConfig();
  const currentVersion = Number.isFinite(config.assetVersion) ? config.assetVersion : 0;
  const nextVersion = currentVersion + 1;

  const nextConfig = {
    ...config,
    assetVersion: nextVersion,
  };

  fs.writeFileSync(buildConfigPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
  console.log(`assetVersion=${nextVersion}`);
}

main();
