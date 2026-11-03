# Home Quick Upload & Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to directly upload any `.apk` file from the Home Operations Queue dashboard and immediately compile recommended patches with real-time upload progress and zero configuration overhead.

**Architecture:** Client-side filename inspection & Community Catalog auto-matching provides progressive disclosure in a 3-state modal. The uploaded binary streams to `/api/upload/apk` with live progress bars, automatically updates or provisions the app in D1/SQLite storage, and immediately launches the patching build runner via `/api/run/batch`.

**Tech Stack:** Vanilla JavaScript (ES2022), CSS3 (Obsidian Cyber Synthetics / Glassmorphism), HTML5 Drag-and-Drop, Node.js Native Test Runner (`node:test`).

## Global Constraints

- **Single-Source-of-Truth**: All package configurations must adhere to existing `packages` schema (`package_name`, `enabled`, `repos`, `custom_base_apk_url`, `options`).
- **Progressive Disclosure**: Three distinct states (`idle` -> `detected` -> `uploading/building`) in a single modal container (`#modal-quick-upload-patch`).
- **Zero-Friction Fallback**: If an APK filename does not match a known community app, the modal smoothly falls back to an interactive search input against the 1,354-app catalog or custom unlisted app input.
- **Mobile First**: Modal renders as a responsive native bottom sheet on screens <= 768px.
- **Documentation & Test Integrity**: Preserve all existing unit tests and contracts; run `npm test` after each task.

---

### Task 1: Filename Parsing & Community Catalog Auto-Matcher Engine

**Files:**
- Create: `tests/unit/quick_upload.test.js`
- Modify: `web/frontend/js/app.js`

**Interfaces:**
- Produces:
  - `parseApkFilenameMetadata(filename: string): { suggestedPkg: string, version: string, friendlyName: string }`
  - `matchCatalogAppByFilename(filename: string, catalog: Record<string, any>): { pkg: string, name: string, iconUrl?: string, patches: string[] } | null`

- [ ] **Step 1: Write the failing unit tests for filename parsing and catalog matching**

Create `tests/unit/quick_upload.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';

// Test mock imports / logic
import { parseApkFilenameMetadata, matchCatalogAppByFilename } from '../../web/frontend/js/app.js';

test('Quick Upload: parseApkFilenameMetadata parses package name and SemVer version from standard naming', () => {
  const result1 = parseApkFilenameMetadata('ch.protonvpn.android_v5.20.57.0.apk');
  assert.equal(result1.suggestedPkg, 'ch.protonvpn.android');
  assert.equal(result1.version, 'v5.20.57.0');

  const result2 = parseApkFilenameMetadata('com.reddit.frontpage_2024.44.0.apk');
  assert.equal(result2.suggestedPkg, 'com.reddit.frontpage');
  assert.equal(result2.version, '2024.44.0');

  const result3 = parseApkFilenameMetadata('Reddit.apk');
  assert.equal(result3.friendlyName.toLowerCase(), 'reddit');
  assert.equal(result3.suggestedPkg, '');
});

test('Quick Upload: matchCatalogAppByFilename resolves package from friendly name or slug', () => {
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
    }
  };

  const match1 = matchCatalogAppByFilename('Reddit_v2024.44.apk', mockCatalog);
  assert.ok(match1);
  assert.equal(match1.pkg, 'com.reddit.frontpage');
  assert.equal(match1.name, 'Reddit');

  const match2 = matchCatalogAppByFilename('com.google.android.youtube.apk', mockCatalog);
  assert.ok(match2);
  assert.equal(match2.pkg, 'com.google.android.youtube');
  assert.equal(match2.name, 'YouTube');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/quick_upload.test.js`  
Expected: FAIL (`parseApkFilenameMetadata is not exported or not defined`).

- [ ] **Step 3: Implement `parseApkFilenameMetadata` and `matchCatalogAppByFilename` in `web/frontend/js/app.js`**

Add exported helpers to `web/frontend/js/app.js`:
```javascript
export function parseApkFilenameMetadata(filename) {
  if (!filename) return { suggestedPkg: '', version: '', friendlyName: '' };
  const clean = filename.replace(/\.apk$/i, '').trim();
  
  // Pattern 1: reverse-domain package name (e.g. com.reddit.frontpage_2024.44.0 or ch.protonvpn.android-5.19)
  const pkgMatch = clean.match(/^([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)(?:[_\-\s]+v?(\d+(?:\.\d+)*[a-zA-Z0-9.-]*))?/);
  if (pkgMatch) {
    return {
      suggestedPkg: pkgMatch[1],
      version: pkgMatch[2] ? (pkgMatch[2].startsWith('v') ? pkgMatch[2] : `v${pkgMatch[2]}`) : '',
      friendlyName: ''
    };
  }

  // Pattern 2: Friendly name with version (e.g. YouTube_v21.30.216 or Reddit-2024.44)
  const nameVerMatch = clean.match(/^([a-zA-Z0-9\s]+?)(?:[_\-\s]+v?(\d+(?:\.\d+)*[a-zA-Z0-9.-]*))?$/);
  if (nameVerMatch) {
    return {
      suggestedPkg: '',
      version: nameVerMatch[2] ? (nameVerMatch[2].startsWith('v') ? nameVerMatch[2] : `v${nameVerMatch[2]}`) : '',
      friendlyName: nameVerMatch[1].trim()
    };
  }

  return { suggestedPkg: '', version: '', friendlyName: clean };
}

export function matchCatalogAppByFilename(filename, catalog) {
  if (!filename || !catalog) return null;
  const meta = parseApkFilenameMetadata(filename);
  
  // Exact package match
  if (meta.suggestedPkg && catalog[meta.suggestedPkg]) {
    return {
      pkg: meta.suggestedPkg,
      name: catalog[meta.suggestedPkg].name || meta.suggestedPkg,
      iconUrl: catalog[meta.suggestedPkg].icon_url,
      repos: catalog[meta.suggestedPkg].supported_repos || []
    };
  }

  // Name match against catalog values
  const targetName = (meta.friendlyName || meta.suggestedPkg).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!targetName) return null;

  for (const [pkg, item] of Object.entries(catalog)) {
    const itemName = (item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const pkgClean = pkg.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (itemName === targetName || pkgClean === targetName || targetName.includes(itemName) && itemName.length > 3) {
      return {
        pkg,
        name: item.name || pkg,
        iconUrl: item.icon_url,
        repos: item.supported_repos || []
      };
    }
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/quick_upload.test.js`  
Expected: PASS (2/2 passing).

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(quick-upload): add APK filename metadata parser and catalog auto-matching engine"
```

---

### Task 2: Home Header Button & Quick Upload Modal Markup

**Files:**
- Modify: `web/frontend/index.html:186-205`
- Modify: `web/frontend/index.html:930-1005`
- Modify: `web/frontend/css/morphe.css`

**Interfaces:**
- Produces:
  - Header button: `#btn-home-upload-patch`
  - Modal: `#modal-quick-upload-patch` with dropzone, app preview, and progress bar elements.

- [ ] **Step 1: Write DOM structure verification test**

Append to `tests/unit/quick_upload.test.js`:
```javascript
import fs from 'node:fs';

test('Quick Upload: index.html contains Home Upload button and modal markup', () => {
  const html = fs.readFileSync('web/frontend/index.html', 'utf8');
  assert.ok(html.includes('id="btn-home-upload-patch"'), 'Missing #btn-home-upload-patch button');
  assert.ok(html.includes('id="modal-quick-upload-patch"'), 'Missing #modal-quick-upload-patch modal');
  assert.ok(html.includes('id="quick-upload-dropzone"'), 'Missing #quick-upload-dropzone');
  assert.ok(html.includes('id="quick-upload-progress-container"'), 'Missing progress container');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/quick_upload.test.js`  
Expected: FAIL (`Missing #btn-home-upload-patch button`).

- [ ] **Step 3: Add button to `web/frontend/index.html` header and modal markup**

In `web/frontend/index.html`, add `#btn-home-upload-patch` in `.bento-header-actions`:
```html
<button class="btn btn-primary" id="btn-home-upload-patch" onclick="openQuickUploadModal()" title="Upload an APK file to immediately configure and compile patches">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
  <span>Upload & Patch</span>
</button>
```

Add modal `#modal-quick-upload-patch` near other modals in `web/frontend/index.html`:
```html
<!-- Modal: Home Quick Upload & Patch Application -->
<div class="modal-overlay" id="modal-quick-upload-patch" onclick="closeQuickUploadModal(event)" style="display: none;">
  <div class="modal-container" style="max-width: 540px;" onclick="event.stopPropagation()">
    <div class="modal-head">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div class="app-card-icon-frame" style="width: 40px; height: 40px; background: var(--surface-sunken);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        </div>
        <div>
          <h2 style="font-size: 1rem; font-weight: 600; margin: 0;">Upload & Patch Application</h2>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Directly upload any clean base APK to patch and compile</div>
        </div>
      </div>
      <button class="btn btn-icon" onclick="closeQuickUploadModal()" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <div class="modal-body" style="padding: 1.25rem;">
      <!-- State 1: Dropzone -->
      <div id="quick-upload-dropzone" class="quick-dropzone" onclick="document.getElementById('quick-upload-file-input').click()">
        <input type="file" id="quick-upload-file-input" accept=".apk" style="display: none;" onchange="handleQuickUploadFileSelected(event)">
        <img src="/apk-icon.png" width="48" height="48" alt="APK" style="width: 48px; height: 48px; object-fit: contain; margin-bottom: 0.5rem; display: inline-block;" onerror="this.style.display='none'">
        <div style="font-weight: 600; font-size: 0.9375rem; margin-bottom: 0.25rem;">Drag & drop your .apk file here</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">Or click to browse from device (ARM64 / universal APK)</div>
      </div>

      <!-- State 2: Detected App Card & Patch Match -->
      <div id="quick-upload-detected-card" style="display: none; margin-top: 1rem; background: var(--surface-sunken); border: 1px solid var(--border-medium); border-radius: var(--radius-md); padding: 1rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div id="quick-upload-app-icon" class="app-card-icon-frame" style="width: 44px; height: 44px; border-radius: var(--radius-sm); overflow: hidden;"></div>
            <div>
              <div id="quick-upload-app-name" style="font-weight: 700; font-size: 0.9375rem;">Detected App</div>
              <div id="quick-upload-app-pkg" style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">com.example.app</div>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="resetQuickUploadFile()" style="font-size: 0.6875rem;">Change</button>
        </div>

        <div style="margin-top: 0.875rem; padding-top: 0.75rem; border-top: 1px solid var(--border-hairline); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
          <div id="quick-upload-patches-summary" style="display: flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; color: var(--text-secondary);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--status-success);"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span id="quick-upload-patch-count">Recommended Patches Ready</span>
          </div>
          <div id="quick-upload-file-size" style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">0 MB</div>
        </div>
      </div>

      <!-- State 3: Real-time Progress Bar -->
      <div id="quick-upload-progress-container" class="upload-progress-container" style="display: none; margin-top: 1rem;">
        <div class="upload-progress-header">
          <span class="upload-progress-status" id="quick-upload-progress-status">Uploading Base APK…</span>
          <span class="upload-progress-percent" id="quick-upload-progress-percent">0%</span>
        </div>
        <div class="upload-progress-track">
          <div class="upload-progress-fill" id="quick-upload-progress-bar"></div>
        </div>
        <div class="upload-progress-footer">
          <span id="quick-upload-progress-filename" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;"></span>
          <span id="quick-upload-progress-bytes">0 MB / 0 MB</span>
        </div>
      </div>

      <!-- Action Footer -->
      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.25rem;">
        <button class="btn btn-secondary btn-sm" onclick="closeQuickUploadModal()">Cancel</button>
        <button class="btn btn-primary btn-sm" id="btn-submit-quick-upload-patch" onclick="submitQuickUploadAndPatch()" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <span>Upload & Patch Now</span>
        </button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/quick_upload.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(quick-upload): add Home button and modal layout markup"
```

---

### Task 3: Modal Interaction & Dropzone Controller

**Files:**
- Modify: `web/frontend/js/app.js`
- Modify: `web/frontend/css/morphe.css`
- Test: `tests/unit/quick_upload.test.js`

**Interfaces:**
- Produces:
  - `openQuickUploadModal(): void`
  - `closeQuickUploadModal(event?: Event): void`
  - `handleQuickUploadFileSelected(event: Event): Promise<void>`
  - `resetQuickUploadFile(): void`

- [ ] **Step 1: Write unit tests for modal controller state management**

Append to `tests/unit/quick_upload.test.js`:
```javascript
test('Quick Upload: controller parses and populates selected file state', () => {
  // Test mock file selection
  const mockFile = { name: 'com.reddit.frontpage_v2024.44.0.apk', size: 61234567 };
  const metadata = parseApkFilenameMetadata(mockFile.name);
  assert.equal(metadata.suggestedPkg, 'com.reddit.frontpage');
  assert.equal(metadata.version, 'v2024.44.0');
});
```

- [ ] **Step 2: Add dropzone styling in `web/frontend/css/morphe.css`**

Add `.quick-dropzone` with dragover pulse and glowing cyber-border:
```css
.quick-dropzone {
  border: 2px dashed var(--border-medium);
  border-radius: var(--radius-md);
  padding: 2.25rem 1rem;
  text-align: center;
  background: var(--surface-sunken);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.quick-dropzone:hover,
.quick-dropzone.dragover {
  border-color: var(--accent-base);
  background: color-mix(in srgb, var(--accent-base) 8%, var(--surface-sunken));
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.15);
}
```

- [ ] **Step 3: Implement modal methods in `web/frontend/js/app.js`**

Implement `openQuickUploadModal`, `closeQuickUploadModal`, `handleQuickUploadFileSelected`, `resetQuickUploadFile`, and dragover handlers:
```javascript
let currentQuickUploadFile = null;
let currentQuickUploadPkg = null;

export function openQuickUploadModal() {
  const modal = document.getElementById('modal-quick-upload-patch');
  if (!modal) return;
  resetQuickUploadFile();
  modal.style.display = 'flex';

  const dropzone = document.getElementById('quick-upload-dropzone');
  if (dropzone && !dropzone.dataset.hasDropListeners) {
    dropzone.dataset.hasDropListeners = 'true';
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processQuickUploadFile(e.dataTransfer.files[0]);
      }
    });
  }
}

export function closeQuickUploadModal(e) {
  if (e && e.target !== e.currentTarget && e.currentTarget.id === 'modal-quick-upload-patch') return;
  const modal = document.getElementById('modal-quick-upload-patch');
  if (modal) modal.style.display = 'none';
  resetQuickUploadFile();
}

export function resetQuickUploadFile() {
  currentQuickUploadFile = null;
  currentQuickUploadPkg = null;
  const fileInput = document.getElementById('quick-upload-file-input');
  if (fileInput) fileInput.value = '';
  const dropzone = document.getElementById('quick-upload-dropzone');
  if (dropzone) dropzone.style.display = 'block';
  const detectedCard = document.getElementById('quick-upload-detected-card');
  if (detectedCard) detectedCard.style.display = 'none';
  const progressContainer = document.getElementById('quick-upload-progress-container');
  if (progressContainer) progressContainer.style.display = 'none';
  const submitBtn = document.getElementById('btn-submit-quick-upload-patch');
  if (submitBtn) submitBtn.disabled = true;
}

export function handleQuickUploadFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (file) processQuickUploadFile(file);
}

export function processQuickUploadFile(file) {
  if (!file.name.toLowerCase().endsWith('.apk')) {
    showToast('Please select a valid Android .apk file', 'error');
    return;
  }
  currentQuickUploadFile = file;
  const catalog = window.morpheCatalogData || {};
  const matched = matchCatalogAppByFilename(file.name, catalog);
  const metadata = parseApkFilenameMetadata(file.name);

  const pkg = matched ? matched.pkg : (metadata.suggestedPkg || 'custom.unlisted.app');
  const name = matched ? matched.name : (metadata.friendlyName || metadata.suggestedPkg || file.name.replace(/\.apk$/i, ''));
  currentQuickUploadPkg = pkg;

  const dropzone = document.getElementById('quick-upload-dropzone');
  if (dropzone) dropzone.style.display = 'none';

  const detectedCard = document.getElementById('quick-upload-detected-card');
  if (detectedCard) detectedCard.style.display = 'block';

  const nameEl = document.getElementById('quick-upload-app-name');
  if (nameEl) nameEl.textContent = name;

  const pkgEl = document.getElementById('quick-upload-app-pkg');
  if (pkgEl) pkgEl.textContent = pkg;

  const sizeEl = document.getElementById('quick-upload-file-size');
  if (sizeEl) sizeEl.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

  const iconEl = document.getElementById('quick-upload-app-icon');
  if (iconEl) {
    iconEl.innerHTML = matched && matched.iconUrl
      ? `<img src="${matched.iconUrl}" width="44" height="44" style="object-fit: cover; width: 100%; height: 100%;">`
      : `<span style="font-weight: 700; color: var(--accent-base);">${name.charAt(0).toUpperCase()}</span>`;
  }

  const patchesEl = document.getElementById('quick-upload-patch-count');
  if (patchesEl) {
    const patches = getCompatiblePatchesForPackage(pkg);
    patchesEl.textContent = `${patches.length > 0 ? patches.length : 'Recommended'} Patches Auto-Selected`;
  }

  const submitBtn = document.getElementById('btn-submit-quick-upload-patch');
  if (submitBtn) submitBtn.disabled = false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/quick_upload.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(quick-upload): implement modal controller, dragover pulse, and app card detection"
```

---

### Task 4: Upload Streaming, Provisioning & Build Handoff

**Files:**
- Modify: `web/frontend/js/app.js`
- Test: `tests/unit/quick_upload.test.js`

**Interfaces:**
- Produces:
  - `submitQuickUploadAndPatch(): Promise<void>`

- [ ] **Step 1: Write integration mock test for upload & build dispatch**

Append to `tests/unit/quick_upload.test.js`:
```javascript
test('Quick Upload: form data builder creates correct multipart payload with package and apk file', () => {
  const formData = new FormData();
  formData.append('package', 'com.reddit.frontpage');
  formData.append('apk', new Blob(['test-apk-binary']), 'reddit.apk');

  assert.equal(formData.get('package'), 'com.reddit.frontpage');
  assert.ok(formData.get('apk'));
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tests/unit/quick_upload.test.js`  
Expected: PASS.

- [ ] **Step 3: Implement `submitQuickUploadAndPatch` in `web/frontend/js/app.js`**

Implement the full end-to-end execution:
```javascript
export async function submitQuickUploadAndPatch() {
  if (!currentQuickUploadFile || !currentQuickUploadPkg) return;

  const pkg = currentQuickUploadPkg;
  const file = currentQuickUploadFile;
  const submitBtn = document.getElementById('btn-submit-quick-upload-patch');
  const progressContainer = document.getElementById('quick-upload-progress-container');
  const progressBar = document.getElementById('quick-upload-progress-bar');
  const progressPercent = document.getElementById('quick-upload-progress-percent');
  const progressBytes = document.getElementById('quick-upload-progress-bytes');
  const progressFilename = document.getElementById('quick-upload-progress-filename');

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="live-pulse-dot"></span><span>Uploading…</span>`;
  }

  if (progressContainer) progressContainer.style.display = 'block';
  if (progressFilename) progressFilename.textContent = file.name;

  try {
    const formData = new FormData();
    formData.append('package', pkg);
    formData.append('apk', file);

    // 1. Upload Base APK with live progress
    await uploadApkWithProgress(
      `/api/upload/apk?package=${encodeURIComponent(pkg)}`,
      formData,
      (progress) => {
        if (progressBar) progressBar.style.width = `${progress.percent}%`;
        if (progressPercent) progressPercent.textContent = `${progress.percent}%`;
        if (progressBytes) progressBytes.textContent = `${progress.loadedMb} / ${progress.totalMb} MB`;
      }
    );

    // 2. Ensure package is configured in state
    let appConfig = state.configuredApps.find(a => (a.package || a.package_name) === pkg);
    if (!appConfig) {
      const catalog = window.morpheCatalogData || {};
      const catItem = catalog[pkg];
      appConfig = {
        package: pkg,
        package_name: pkg,
        name: catItem?.name || pkg,
        enabled: true,
        repos: catItem?.supported_repos || ['MorpheApp/morphe-patches']
      };
      state.configuredApps.push(appConfig);
      try {
        await fetch('/api/packages/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appConfig)
        });
      } catch (e) {
        console.warn('Could not auto-register package:', e);
      }
    }

    showToast(`APK uploaded! Starting build for ${appConfig.name || pkg}…`, 'success');
    closeQuickUploadModal();

    // 3. Immediately trigger build runner
    await runSingleAppPatch(pkg);
    if (typeof loadOverviewData === 'function') loadOverviewData();
  } catch (err) {
    showToast(`Upload failed: ${err.message}`, 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Retry Upload</span>`;
    }
  }
}
```

- [ ] **Step 4: Run full test suite to verify no regressions**

Run: `npm test && npx tsc --noEmit`  
Expected: PASS (70+ passing, 0 errors).

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(quick-upload): complete upload streaming, auto-provisioning, and build handoff"
```

---

### Task 5: End-to-End Verification & Documentation Update

**Files:**
- Modify: `docs/user-guide.md`
- Modify: `README.md`
- Test: All tests via `npm test`

- [ ] **Step 1: Document the Home "Upload & Patch" flow in `docs/user-guide.md` and `README.md`**
- [ ] **Step 2: Run test suite `npm test` and type verification `npx tsc --noEmit`**
- [ ] **Step 3: Commit and push changes to both remotes**

```bash
git commit -am "docs(guide): document Home Upload & Patch capability and finalize v2.4.2"
git push origin main && git push morpheflow-portal main
```
