import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

test('App Source Selector & Verifier: app.js contains provider dropdown and live verifier', () => {
  const appJs = fs.readFileSync('web/frontend/js/app.js', 'utf8');

  // Provider choice dropdown
  assert.ok(appJs.includes('id="drawer-app-source-type"'), 'app.js must contain #drawer-app-source-type');
  assert.ok(appJs.includes('value="auto"'), 'Provider dropdown must support auto-detect');
  assert.ok(appJs.includes('value="github"'), 'Provider dropdown must support github releases');
  assert.ok(appJs.includes('value="google_play"'), 'Provider dropdown must support google_play / aurora');
  assert.ok(appJs.includes('value="apkmirror"'), 'Provider dropdown must support apkmirror');
  assert.ok(appJs.includes('value="apkpure"'), 'Provider dropdown must support apkpure');
  assert.ok(appJs.includes('value="direct"'), 'Provider dropdown must support direct URLs');

  // Verify Source button & handler
  assert.ok(appJs.includes('verifyDrawerSource'), 'app.js must contain verifyDrawerSource function');
  assert.ok(appJs.includes('id="btn-drawer-verify-source"'), 'app.js must contain #btn-drawer-verify-source');
  assert.ok(appJs.includes('id="drawer-source-verify-status"'), 'app.js must contain #drawer-source-verify-status');

  // Save Source handler
  assert.ok(appJs.includes('saveDrawerSource'), 'app.js must contain saveDrawerSource function');

  // CSS contains verification status panel styling
  const css = fs.readFileSync('web/frontend/css/morphe.css', 'utf8');
  assert.ok(css.includes('.status-badge-panel'), 'morphe.css must define .status-badge-panel');
  assert.ok(css.includes('.status-badge-panel.success'), 'morphe.css must define .status-badge-panel.success');
  assert.ok(css.includes('.status-badge-panel.error'), 'morphe.css must define .status-badge-panel.error');
});

test('Clean Release Generator: generate_release_notes.py produces compliant title and notes', () => {
  const outTitle = '/tmp/test_release_title.txt';
  const outNotes = '/tmp/test_release_notes.md';

  const cmd = `python3 scripts/generate_release_notes.py --pkg "com.spocky.projengmenu" --name "Projectivy Launcher" --version "4.73" --apk "README.md" --repo "wiwek13/MorpheFlow" --out-notes "${outNotes}" --out-title "${outTitle}"`;
  execSync(cmd, { encoding: 'utf8' });

  const title = fs.readFileSync(outTitle, 'utf8').trim();
  const notes = fs.readFileSync(outNotes, 'utf8');

  // 1. Release Title format: {App Name} v{Version}
  assert.equal(title, 'Projectivy Launcher v4.73', 'Release title must match {App Name} v{Version}');

  // 2. 1-Click Obtainium link at top
  assert.ok(notes.includes('Instant 1-Click Install in Obtainium'), 'Release notes must feature Obtainium section at top');
  assert.ok(notes.includes('https://apps.obtainium.imranr.dev/redirect?r='), 'Release notes must contain redirect deep link');

  // 3. Upstream Base APK Source link
  assert.ok(notes.includes('Base APK Upstream Source:'), 'Release notes must state upstream base APK source');
  assert.ok(notes.includes('spocky/miproja1'), 'Projectivy Launcher must link upstream spocky/miproja1 repo');

  // 4. Applied patches & direct download
  assert.ok(notes.includes('Applied Patches'), 'Release notes must list applied patches');
  assert.ok(notes.includes('https://github.com/wiwek13/MorpheFlow/releases/download/app-com.spocky.projengmenu/README.md'), 'Release notes must provide direct APK download link');
});

test('Obtainium Regex Compatibility with {App Name} v{Version} format', () => {
  // Test that Obtainium version extraction regex extracts version from title
  const title = 'Projectivy Launcher v4.73';
  const versionRegex = /v?([0-9][0-9a-zA-Z._-]+)$/;
  const match = title.match(versionRegex);

  assert.ok(match, 'Obtainium version regex must match release title');
  assert.equal(match[1], '4.73', 'Extracted version must be 4.73');

  // Test title filter matches app name or package
  const titleFilter = /(Projectivy Launcher|com\.spocky\.projengmenu)/i;
  assert.ok(titleFilter.test(title), 'Title filter must match release title');
});

test('Worker Router & Storage: app_sources and source probe routes are registered', () => {
  const routerTs = fs.readFileSync('worker/router.ts', 'utf8');
  assert.ok(routerTs.includes("path === '/api/source/probe'"), 'router.ts must handle /api/source/probe');
  assert.ok(routerTs.includes("path === '/api/app_sources'"), 'router.ts must handle /api/app_sources');
  assert.ok(routerTs.includes("path.startsWith('/api/app_sources/')"), 'router.ts must handle /api/app_sources/:package');
  assert.ok(routerTs.includes('app_sources: appSources'), 'router.ts /api/config and /api/runner/sync must return app_sources');

  const storageTs = fs.readFileSync('worker/storage.ts', 'utf8');
  assert.ok(storageTs.includes('getAppSources(): Promise<Record<string, AppSourceRecord>>'), 'storage.ts must define getAppSources');
  assert.ok(storageTs.includes('getAppSource(pkg: string): Promise<AppSourceRecord | null>'), 'storage.ts must define getAppSource');
  assert.ok(storageTs.includes('setAppSource(source: AppSourceRecord): Promise<void>'), 'storage.ts must define setAppSource');
});
