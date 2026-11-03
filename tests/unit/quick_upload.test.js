import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

function loadFrontendApp() {
  const appJsCode = fs.readFileSync(path.join(ROOT_DIR, 'web/frontend/js/app.js'), 'utf8');
  const ctx = {
    window: {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { userAgent: 'NodeTest' },
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    fetch: () => Promise.resolve()
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(appJsCode, ctx);
  return ctx;
}

test('Quick Upload: parseApkFilenameMetadata parses package name and SemVer version from standard naming', () => {
  const app = loadFrontendApp();
  assert.equal(typeof app.parseApkFilenameMetadata, 'function', 'parseApkFilenameMetadata must be defined in app.js');

  const result1 = app.parseApkFilenameMetadata('ch.protonvpn.android_v5.20.57.0.apk');
  assert.equal(result1.suggestedPkg, 'ch.protonvpn.android');
  assert.equal(result1.version, 'v5.20.57.0');

  const result2 = app.parseApkFilenameMetadata('com.reddit.frontpage_2024.44.0.apk');
  assert.equal(result2.suggestedPkg, 'com.reddit.frontpage');
  assert.equal(result2.version, '2024.44.0');

  const result3 = app.parseApkFilenameMetadata('Reddit.apk');
  assert.equal(result3.friendlyName.toLowerCase(), 'reddit');
  assert.equal(result3.suggestedPkg, '');

  const result4 = app.parseApkFilenameMetadata('YouTube_v21.30.216.apk');
  assert.equal(result4.friendlyName.toLowerCase(), 'youtube');
  assert.equal(result4.version, 'v21.30.216');
});

test('Quick Upload: matchCatalogAppByFilename resolves package from friendly name or slug', () => {
  const app = loadFrontendApp();
  assert.equal(typeof app.matchCatalogAppByFilename, 'function', 'matchCatalogAppByFilename must be defined in app.js');

  const mockCatalog = {
    'com.reddit.frontpage': {
      name: 'Reddit',
      icon_url: 'https://example.com/reddit.png',
      supported_repos: ['MorpheApp/morphe-patches']
    },
    'com.google.android.youtube': {
      name: 'YouTube',
      icon_url: 'https://example.com/yt.png',
      supported_repos: ['MorpheApp/morphe-patches']
    },
    'ch.protonvpn.android': {
      name: 'Proton VPN',
      icon_url: 'https://example.com/proton.png',
      supported_repos: ['MorpheApp/morphe-patches']
    }
  };

  const match1 = app.matchCatalogAppByFilename('Reddit_v2024.44.apk', mockCatalog);
  assert.ok(match1);
  assert.equal(match1.pkg, 'com.reddit.frontpage');
  assert.equal(match1.name, 'Reddit');

  const match2 = app.matchCatalogAppByFilename('com.google.android.youtube.apk', mockCatalog);
  assert.ok(match2);
  assert.equal(match2.pkg, 'com.google.android.youtube');
  assert.equal(match2.name, 'YouTube');

  const match3 = app.matchCatalogAppByFilename('ch.protonvpn.android_v5.20.57.0.apk', mockCatalog);
  assert.ok(match3);
  assert.equal(match3.pkg, 'ch.protonvpn.android');
  assert.equal(match3.name, 'Proton VPN');

  const matchNull = app.matchCatalogAppByFilename('random_unknown_file.apk', mockCatalog);
  assert.equal(matchNull, null);
});

test('Quick Upload: index.html and morphe.css contain Home Upload button and modal markup', () => {
  const html = fs.readFileSync(path.join(ROOT_DIR, 'web/frontend/index.html'), 'utf8');
  assert.ok(html.includes('id="btn-home-upload-patch"'), 'Missing #btn-home-upload-patch button in index.html');
  assert.ok(html.includes('id="modal-quick-upload-patch"'), 'Missing #modal-quick-upload-patch modal in index.html');
  assert.ok(html.includes('id="quick-upload-dropzone"'), 'Missing #quick-upload-dropzone');
  assert.ok(html.includes('id="quick-upload-detected-card"'), 'Missing #quick-upload-detected-card');
  assert.ok(html.includes('id="quick-upload-progress-container"'), 'Missing #quick-upload-progress-container');
  assert.ok(html.includes('id="btn-submit-quick-upload-patch"'), 'Missing #btn-submit-quick-upload-patch');

  const css = fs.readFileSync(path.join(ROOT_DIR, 'web/frontend/css/morphe.css'), 'utf8');
  assert.ok(css.includes('.quick-dropzone'), 'Missing .quick-dropzone styles in morphe.css');
});

