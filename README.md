# FJG File Focus Duo

Version 0.1.4. Private repository: https://github.com/jajuangarrett-ctrl/fjg-file-focus-duo. Independent Obsidian plugin derived from Franklin Garrett’s FJG File Focus 0.3.7 (9e4c09e), itself based on ozntel/file-tree-alternative. The inherited package declares MIT licensing; upstream attribution remains applicable.

Duo uses its own plugin identity, settings and UI. It adapts to panel width: one-column navigation below 560 CSS pixels and folder/file columns above it. Touch targets are at least 44px. File names default to 14px.

Tap ⋯ for the searchable **All File Focus buttons** panel, including Folder Navigator and the original folder/note actions. Back returns to the parent; hold it to return to the vault root. Root files remain available through Show vault-root files. The Include Files From Subfolders setting controls whether folder lists also include descendants. TXT files remain supported. A one-time visibility-only import can use the original plugin’s filters; it does not copy credentials.

## Build

Use a Node version supporting the built-in TypeScript test runner (Node 24 or compatible):

```sh
npm install
npm run typecheck
npm test
npm run build
```

The build writes the three portable runtime files and SHA-256 checksums in dist/ and refreshes main.js and SHA256SUMS.json at the repository root. It does not install them into a vault. To install manually, copy main.js, manifest.json and styles.css into the vault’s .obsidian/plugins/fjg-file-focus-duo/ folder and enable the plugin.

For synthetic browser checks, run npm run test:browser:build, serve this folder on localhost port 8847, then run npm run test:browser and node tests/browser/buttons.cjs. Set DUO_BROWSER_BIN to a local Chromium executable.

Browser tests cover the four measured panel sizes, toolbar/button access, filtering, touch menus, resizing and reveal behavior. These are not comprehensive physical-phone acceptance results. Companion integrations require the relevant plugins; unsupported actions show notices. See FEATURE-COVERAGE.md for retained functionality.

The inherited voice API-key setting stores its value in the plugin’s data.json. Never include that file in source control. No credentials, vault contents or device diagnostics are included in this source package.

## Saved runtime

The repository root includes main.js, manifest.json, styles.css, versions.json and SHA256SUMS.json. These runtime files match the installed 0.1.4 build. This source backup does not itself create a GitHub release for BRAT.

## Automatic GitHub backup

The always-on Mac checks this connected checkout every 60 seconds and automatically commits and pushes changes on main to the private origin repository. Source changes are saved automatically; run npm run build when updating the installable runtime. Use this connected checkout for future work, not the outer development/archive workspace. The job skips detached/non-main branches and repositories behind GitHub with local changes, and does not force-push. It needs the Mac awake, the external SSD available, and network/GitHub authentication working.

Settings, credential files, node_modules, logs and local release archives are ignored. Automatic pushes do not create GitHub tags or releases, install updates into Obsidian, or configure BRAT.
