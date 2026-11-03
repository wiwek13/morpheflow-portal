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
  const domElements = new Map();
  const getOrCreateMockEl = (id) => {
    if (!domElements.has(id)) {
      domElements.set(id, {
        id,
        style: {},
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); },
          toggle(c, force) {
            if (force !== undefined) {
              if (force) this.classes.add(c);
              else this.classes.delete(c);
            } else {
              if (this.classes.has(c)) this.classes.delete(c);
              else this.classes.add(c);
            }
          }
        },
        dataset: {},
        innerHTML: '',
        textContent: '',
        value: '',
        disabled: false,
        appendChild: () => {},
        addEventListener: () => {},
        click: () => {},
        focus: () => {}
      });
    }
    return domElements.get(id);
  };

  const ctx = {
    window: {},
    document: {
      getElementById: (id) => getOrCreateMockEl(id),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({
        style: {},
        classList: { add: () => {}, remove: () => {} },
        appendChild: () => {},
        remove: () => {}
      }),
      body: { appendChild: () => {} }
    },
    FormData: class MockFormData {
      constructor() { this.data = new Map(); }
      append(k, v) { this.data.set(k, v); }
      get(k) { return this.data.get(k); }
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { userAgent: 'NodeTest' },
    URL: globalThis.URL,
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    fetch: () => Promise.resolve()
  };
  ctx.window = ctx;
  ctx._domElements = domElements;
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

test('Quick Upload: controller manages modal lifecycle, file selection, and UI transitions', () => {
  const app = loadFrontendApp();
  assert.equal(typeof app.openQuickUploadModal, 'function', 'openQuickUploadModal must be defined');
  assert.equal(typeof app.closeQuickUploadModal, 'function', 'closeQuickUploadModal must be defined');
  assert.equal(typeof app.processQuickUploadFile, 'function', 'processQuickUploadFile must be defined');
  assert.equal(typeof app.resetQuickUploadFile, 'function', 'resetQuickUploadFile must be defined');

  // 1. Open Modal
  app.openQuickUploadModal();
  const modalEl = app._domElements.get('modal-quick-upload-patch');
  assert.ok(modalEl.classList.contains('open'), 'Modal must have class open when opened');

  // 2. Process file selection
  const mockFile = {
    name: 'ch.protonvpn.android_v5.20.57.0.apk',
    size: 45 * 1024 * 1024
  };
  app.window.morpheCatalogData = {
    'ch.protonvpn.android': {
      name: 'Proton VPN',
      icon_url: 'https://example.com/proton.png'
    }
  };

  app.processQuickUploadFile(mockFile);

  const nameEl = app._domElements.get('quick-upload-app-name');
  assert.equal(nameEl.textContent, 'Proton VPN');

  const pkgEl = app._domElements.get('quick-upload-app-pkg');
  assert.equal(pkgEl.textContent, 'ch.protonvpn.android');

  const sizeEl = app._domElements.get('quick-upload-file-size');
  assert.equal(sizeEl.textContent, '45.0 MB');

  const submitBtn = app._domElements.get('btn-submit-quick-upload-patch');
  assert.equal(submitBtn.disabled, false);

  const detectedCard = app._domElements.get('quick-upload-detected-card');
  assert.equal(detectedCard.style.display, 'block');

  const dropzoneEl = app._domElements.get('quick-upload-dropzone');
  assert.equal(dropzoneEl.style.display, 'none');

  // 3. Reset file selection
  app.resetQuickUploadFile();
  assert.equal(submitBtn.disabled, true);
  assert.equal(detectedCard.style.display, 'none');
  assert.equal(dropzoneEl.style.display, 'block');

  // 4. Close Modal
  app.closeQuickUploadModal();
  assert.equal(modalEl.classList.contains('open'), false, 'Modal must not have class open when closed');
});

test('Quick Upload: submitQuickUploadAndPatch uploads binary and dispatches build handoff', async () => {
  const app = loadFrontendApp();
  assert.equal(typeof app.submitQuickUploadAndPatch, 'function', 'submitQuickUploadAndPatch must be defined');

  let uploadedUrl = null;
  let dispatchedPkg = null;
  let addedAppPayload = null;

  // Mock uploadApkWithProgress
  app.window.uploadApkWithProgress = async (url, formData, onProgress) => {
    uploadedUrl = url;
    onProgress({ percent: 50, loadedMb: '20.0', totalMb: '40.0' });
    onProgress({ percent: 100, loadedMb: '40.0', totalMb: '40.0' });
    return { status: 'success', base_apk_url: 'https://example.com/base.apk' };
  };

  // Mock runSingleAppPatch
  app.window.runSingleAppPatch = async (pkg, skipPrompt) => {
    dispatchedPkg = pkg;
  };

  // Mock fetch for /api/config/app
  app.window.fetch = async (url, opts) => {
    if (url === '/api/config/app') {
      addedAppPayload = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ status: 'success' }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  const mockFile = { name: 'com.reddit.frontpage_v2024.44.0.apk', size: 40 * 1024 * 1024 };
  app.processQuickUploadFile(mockFile);

  await app.submitQuickUploadAndPatch();

  assert.equal(uploadedUrl, '/api/upload/apk?package=com.reddit.frontpage');
  assert.equal(dispatchedPkg, 'com.reddit.frontpage');
  assert.ok(addedAppPayload);
  assert.equal(addedAppPayload.package, 'com.reddit.frontpage');
});

test('Quick Upload: extractApkFilenameFromUrl extracts valid filename from multiple URL patterns', () => {
  const app = loadFrontendApp();
  assert.equal(typeof app.extractApkFilenameFromUrl, 'function', 'extractApkFilenameFromUrl must be defined');

  // Standard GitHub release link
  const fn1 = app.extractApkFilenameFromUrl('https://github.com/wiwek13/AutoMorph/releases/download/base-apks/ch.protonvpn.android_v5.20.57.0.apk?download=true');
  assert.equal(fn1, 'ch.protonvpn.android_v5.20.57.0.apk');

  // URL encoded spaces/version
  const fn2 = app.extractApkFilenameFromUrl('https://cdn.example.com/files/Reddit%20v2024.44.0.apk#hash');
  assert.equal(fn2, 'Reddit v2024.44.0.apk');

  // Direct APK link
  const fn3 = app.extractApkFilenameFromUrl('https://mirror.example.org/apks/com.google.android.youtube.apk');
  assert.equal(fn3, 'com.google.android.youtube.apk');

  // Query parameter with package fallback
  const fn4 = app.extractApkFilenameFromUrl('https://store.example.com/download.php?pkg=com.instagram.android&v=1.0');
  assert.equal(fn4, 'com.instagram.android.apk');
});

test('Quick Upload: direct download URL tab switching, detection, and build handoff', async () => {
  const app = loadFrontendApp();
  assert.equal(typeof app.switchQuickUploadTab, 'function', 'switchQuickUploadTab must be defined');
  assert.equal(typeof app.detectQuickUploadUrl, 'function', 'detectQuickUploadUrl must be defined');

  // 1. Switch to URL mode
  app.switchQuickUploadTab('url');
  const fileSection = app._domElements.get('quick-upload-file-section');
  const urlSection = app._domElements.get('quick-upload-url-section');
  assert.equal(fileSection.style.display, 'none');
  assert.equal(urlSection.style.display, 'block');

  // 2. Set URL and detect app
  app.window.morpheCatalogData = {
    'com.reddit.frontpage': {
      name: 'Reddit',
      icon_url: 'https://example.com/reddit.png'
    }
  };

  const urlInput = app._domElements.get('quick-upload-url-input');
  urlInput.value = 'https://github.com/wiwek13/AutoMorph/releases/download/base-apks/com.reddit.frontpage_v2024.44.0.apk';

  app.detectQuickUploadUrl();

  const detectedCard = app._domElements.get('quick-upload-detected-card');
  assert.equal(detectedCard.style.display, 'block');

  const nameEl = app._domElements.get('quick-upload-app-name');
  assert.equal(nameEl.textContent, 'Reddit');

  const pkgEl = app._domElements.get('quick-upload-app-pkg');
  assert.equal(pkgEl.textContent, 'com.reddit.frontpage');

  const sizeEl = app._domElements.get('quick-upload-file-size');
  assert.equal(sizeEl.textContent, 'Direct Cloud URL');

  const submitBtn = app._domElements.get('btn-submit-quick-upload-patch');
  assert.equal(submitBtn.disabled, false);

  // 3. Submit with direct URL
  let configuredBaseApkUrl = null;
  let dispatchedPkg = null;

  app.window.fetch = async (url, opts) => {
    if (url === '/api/config/app/base-apk' || url.startsWith('/api/upload/apk')) {
      const body = JSON.parse(opts.body);
      configuredBaseApkUrl = body.base_apk_url || body.url;
      return { ok: true, json: async () => ({ status: 'success' }) };
    }
    if (url === '/api/config/app') {
      return { ok: true, json: async () => ({ status: 'success' }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  app.window.runSingleAppPatch = async (pkg, skipPrompt) => {
    dispatchedPkg = pkg;
  };

  await app.submitQuickUploadAndPatch();

  assert.equal(configuredBaseApkUrl, 'https://github.com/wiwek13/AutoMorph/releases/download/base-apks/com.reddit.frontpage_v2024.44.0.apk');
  assert.equal(dispatchedPkg, 'com.reddit.frontpage');
});

test('Quick Upload: index.html contains segmented tabs and Direct URL input markup', () => {
  const html = fs.readFileSync(path.join(ROOT_DIR, 'web/frontend/index.html'), 'utf8');
  assert.ok(html.includes('id="tab-btn-quick-file"'), 'Missing #tab-btn-quick-file');
  assert.ok(html.includes('id="tab-btn-quick-url"'), 'Missing #tab-btn-quick-url');
  assert.ok(html.includes('id="quick-upload-file-section"'), 'Missing #quick-upload-file-section');
  assert.ok(html.includes('id="quick-upload-url-section"'), 'Missing #quick-upload-url-section');
  assert.ok(html.includes('id="quick-upload-url-input"'), 'Missing #quick-upload-url-input');
});




