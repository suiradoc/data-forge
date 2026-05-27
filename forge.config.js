const { VitePlugin } = require('@electron-forge/plugin-vite');
const { execSync } = require('child_process');

module.exports = {
  packagerConfig: {
    name: 'Data Forge',
    asar: true,
    icon: './build/forge_logo',
  },
  hooks: {
    packageAfterPrune: async (_config, buildPath) => {
      execSync('npm install --omit=dev --no-package-lock --no-audit --no-fund', {
        cwd: buildPath,
        stdio: 'inherit',
      });
    },
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    { name: '@electron-forge/maker-dmg', config: {} },
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/index.js',      config: 'vite.main.config.mjs' },
        { entry: 'src/preload/preload.js',  config: 'vite.preload.config.mjs' },
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.mjs' },
      ],
    }),
  ],
};
