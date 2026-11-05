## Talk to Vault — 0.1.9

The adaptive toolbar now includes **Talk to Vault** beside Bookmarks and More. Opening it leaves the microphone off. The Start button names the key source and authorizes that conversation: microphone audio, vault name, selected paths and relevant note excerpts are sent to OpenAI; clear requested edits save immediately and API charges may apply.

Duo first uses its own configured key. If that is blank, the explicit **Use Objective Manager key and start** button reads Objective Manager’s saved key for that conversation. Duo does not copy it into its settings or invoke Objective Manager’s key recovery/persistence methods. This does not configure a new key or grant automatic access on modal open.

Connection failures now distinguish authentication, model/configuration and quota errors using fixed messages without displaying provider response bodies. Backend `response.failed` events terminate the session and show the error instead of silently leaving an unusable conversation active. The GPT-Live session endpoint and protocol remain unchanged.

Validation commands: `npm run typecheck`, `npm test`, `npm run test:voice`, `npm run build`, and (with the synthetic browser fixture running) `node tests/browser/voice-toolbar.cjs`. Synthetic tests use dummy keys and notes; they do not verify live account/model access or physical-device audio. The standard `fjg-file-focus` plugin is outside this update.

# FJG File Focus Duo

Version 0.1.5. Private repository: https://github.com/jajuangarrett-ctrl/fjg-file-focus-duo. Independent Obsidian plugin derived from Franklin Garrett’s FJG File Focus 0.3.7 (9e4c09e), itself based on ozntel/file-tree-alternative. The inherited package declares MIT licensing; upstream attribution remains applicable.

Duo uses its own plugin identity, settings and UI. It adapts to panel width: one-column navigation below 560 CSS pixels and folder/file columns above it. Touch targets are at least 44px. File names default to 14px.

On mobile, the left panel opens to a searchable **Shortcuts** grid containing the original toolbar actions. **Folders** returns to the navigator; the choice is remembered on that device. Vault Control Center 0.3.22 selections update the folder context for shortcuts. Desktop keeps the existing navigator.

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

For synthetic browser checks, run npm run test:browser:build, serve this folder on localhost port 8847, then run npm run test:browser and node tests/browser/buttons.cjs, and node tests/browser/shortcuts.cjs. For the companion layout check, set VCC_CSS to Vault Control Center styles.css and run node tests/browser/vcc-layout.cjs. Set DUO_BROWSER_BIN to a local Chromium executable.

Browser tests cover the four measured panel sizes, toolbar/button access, filtering, touch menus, resizing and reveal behavior. These are not comprehensive physical-phone acceptance results. Companion integrations require the relevant plugins; unsupported actions show notices. See FEATURE-COVERAGE.md for retained functionality.

The inherited voice API-key setting stores its value in the plugin’s data.json. Never include that file in source control. No credentials, vault contents or device diagnostics are included in this source package.

## Saved runtime

The repository root includes main.js, manifest.json, styles.css, versions.json and SHA256SUMS.json. These runtime files match the installed 0.1.5 build. This source backup does not itself create a GitHub release for BRAT.

## Automatic GitHub backup

The always-on Mac checks this connected checkout every 60 seconds and automatically commits and pushes changes on main to the private origin repository. Source changes are saved automatically; run npm run build when updating the installable runtime. Use this connected checkout for future work, not the outer development/archive workspace. The job skips detached/non-main branches and repositories behind GitHub with local changes, and does not force-push. It needs the Mac awake, the external SSD available, and network/GitHub authentication working.

Settings, credential files, node_modules, logs and local release archives are ignored. Automatic pushes do not create GitHub tags or releases, install updates into Obsidian, or configure BRAT.
