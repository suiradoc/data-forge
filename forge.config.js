const path = require('path');
const { VitePlugin } = require('@electron-forge/plugin-vite');
const { execSync } = require('child_process');

const runMeFirstScript = path.join(__dirname, 'build', 'Run Me First.command');

module.exports = {
  packagerConfig: {
    name: 'DataForge',
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
    postMake: async (_config, makeResults) => {
      // maker-zip on darwin only zips the .app bundle itself, so the helper
      // has to be injected into the finished archive rather than placed
      // alongside it beforehand.
      for (const result of makeResults) {
        for (const artifactPath of result.artifacts) {
          if (artifactPath.endsWith('.zip')) {
            execSync(`zip -j "${artifactPath}" "${runMeFirstScript}"`);
          }
        }
      }
      return makeResults;
    },
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        contents: (opts) => [
          { x: 448, y: 344, type: 'link', path: '/Applications' },
          { x: 192, y: 344, type: 'file', path: opts.appPath },
          { x: 320, y: 175, type: 'file', path: runMeFirstScript },
        ],
      },
    },
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
