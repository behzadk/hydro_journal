/* submit.js — Entry submission with image compression */

(function () {
  'use strict';

  const MAX_IMAGE_DIMENSION = 1200;
  const JPEG_QUALITY = 0.8;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  let selectedFiles = [];

  // ── Init ────────────────────────────────────────────

  function init() {
    loadExperimentDropdown();

    // Set date default to today
    const dateInput = $('#entry-date');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Set time default to now
    const timeInput = $('#entry-time');
    if (timeInput) {
      const now = new Date();
      timeInput.value = now.toTimeString().slice(0, 5);
    }

    // Photo upload
    const photoInput = $('#photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', onPhotosSelected);
    }

    // Form submission
    const form = $('#entry-form');
    if (form) {
      form.addEventListener('submit', onSubmit);
    }

    // Check auth status
    updateAuthStatus();
  }

  // ── Auth Status ─────────────────────────────────────

  function updateAuthStatus() {
    const statusEl = $('#auth-status');
    if (!statusEl) return;

    if (Auth.isConfigured()) {
      statusEl.innerHTML = '<span class="alert alert-success">Connected to GitHub</span>';
    } else {
      statusEl.innerHTML = '<span class="alert alert-error">Not connected. <a href="settings.html">Configure your token</a></span>';
    }
  }

  // ── Experiment Dropdown ─────────────────────────────

  async function loadExperimentDropdown() {
    const select = $('#experiment-select');
    if (!select) return;

    try {
      const res = await fetch('../data/experiments.json');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      const experiments = data.experiments || [];

      select.innerHTML = '<option value="">Select experiment...</option>' +
        experiments.map(e =>
          `<option value="${e.id}">${e.name} (${e.status})</option>`
        ).join('');
    } catch (err) {
      select.innerHTML = '<option value="">Error loading experiments</option>';
    }
  }

  // ── Photo Handling ──────────────────────────────────

  function onPhotosSelected(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      selectedFiles.push(file);
    });
    renderPhotoPreviews();
    e.target.value = '';
  }

  function renderPhotoPreviews() {
    const area = $('#photo-previews');
    if (!area) return;

    area.innerHTML = selectedFiles.map((file, idx) => {
      const url = URL.createObjectURL(file);
      return `
        <div class="photo-preview">
          <img src="${url}" alt="Preview">
          <button type="button" class="remove-photo" data-idx="${idx}">&times;</button>
        </div>
      `;
    }).join('');

    $$('.remove-photo', area).forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        selectedFiles.splice(idx, 1);
        renderPhotoPreviews();
      });
    });
  }

  // ── Image Compression ──────────────────────────────

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        let { width, height } = img;
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width > height) {
            height = Math.round(height * MAX_IMAGE_DIMENSION / width);
            width = MAX_IMAGE_DIMENSION;
          } else {
            width = Math.round(width * MAX_IMAGE_DIMENSION / height);
            height = MAX_IMAGE_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Get base64 JPEG data (strip the data:image/jpeg;base64, prefix)
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  }

  // ── Form Submission ─────────────────────────────────

  async function onSubmit(e) {
    e.preventDefault();

    const submitBtn = $('#submit-btn');
    const progressEl = $('#submit-progress');

    // Validate
    if (!Auth.isConfigured()) {
      showError('Please configure your GitHub token in Settings first.');
      return;
    }

    const experimentId = $('#experiment-select').value;
    if (!experimentId) {
      showError('Please select an experiment.');
      return;
    }

    const date = $('#entry-date').value;
    if (!date) {
      showError('Please enter a date.');
      return;
    }

    const time = $('#entry-time').value || '';
    const notes = $('#entry-notes').value || '';
    const ph = $('#measurement-ph').value;
    const ec = $('#measurement-ec').value;
    const waterTemp = $('#measurement-temp').value;

    // Build measurements object (only include non-empty)
    const measurements = {};
    if (ph !== '') measurements.ph = parseFloat(ph);
    if (ec !== '') measurements.ec = parseFloat(ec);
    if (waterTemp !== '') measurements.waterTemp = parseFloat(waterTemp);

    // Disable form
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    progressEl.innerHTML = '';

    const token = Auth.getToken();
    const owner = Auth.getOwner();
    const repo = Auth.getRepo();

    try {
      const files = [];
      const imagePaths = [];

      // Step 1: Compress and prepare images
      if (selectedFiles.length > 0) {
        addProgress(progressEl, 'Compressing photos...');
        for (let i = 0; i < selectedFiles.length; i++) {
          const seq = String(i + 1).padStart(3, '0');
          const path = `images/${experimentId}/${date}_${seq}.jpg`;
          const base64 = await compressImage(selectedFiles[i]);
          files.push({ path, content: base64, encoding: 'base64' });
          imagePaths.push(path);
          addProgress(progressEl, `Compressed photo ${i + 1}/${selectedFiles.length}`);
        }
      }

      // Step 2: Determine entry filename (handle multiple per day)
      addProgress(progressEl, 'Checking existing entries...');
      const indexPath = `data/experiments/${experimentId}/entries/index.json`;
      let existingIndex = await GitHubAPI.getFileContent(token, owner, repo, indexPath);
      if (!existingIndex) {
        existingIndex = { entries: [] };
      }

      let entryFilename = `${date}.json`;
      // Check if an entry already exists for this date
      const existing = existingIndex.entries.filter(f => f.startsWith(date));
      if (existing.length > 0) {
        // Find the next sequence number
        let maxSeq = 0;
        for (const f of existing) {
          const match = f.match(/_(\d+)\.json$/);
          if (match) {
            maxSeq = Math.max(maxSeq, parseInt(match[1]));
          } else {
            // The base file exists without sequence, so the next is _02
            maxSeq = Math.max(maxSeq, 1);
          }
        }
        const nextSeq = String(maxSeq + 1).padStart(2, '0');
        entryFilename = `${date}_${nextSeq}.json`;
      }

      // Step 3: Build entry JSON
      const entry = {
        date,
        time,
        notes,
        images: imagePaths,
        measurements
      };

      const entryPath = `data/experiments/${experimentId}/entries/${entryFilename}`;
      files.push({
        path: entryPath,
        content: JSON.stringify(entry, null, 2)
      });

      // Step 4: Update index.json
      existingIndex.entries.push(entryFilename);
      existingIndex.entries.sort();
      files.push({
        path: indexPath,
        content: JSON.stringify(existingIndex, null, 2)
      });

      // Step 5: Commit everything
      const commitMsg = `journal: ${experimentId} entry ${date}`;
      await GitHubAPI.commitFiles(token, owner, repo, commitMsg, files, (step, msg) => {
        addProgress(progressEl, msg);
      });

      // Success
      addProgress(progressEl, 'Entry submitted successfully!', 'done');
      resetForm();

    } catch (err) {
      addProgress(progressEl, `Error: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Entry';
    }
  }

  function addProgress(el, message, cls = 'active') {
    // Mark previous steps as done
    const prev = el.querySelectorAll('.step.active');
    prev.forEach(s => { s.className = 'step done'; });

    const step = document.createElement('div');
    step.className = `step ${cls}`;
    step.textContent = message;
    el.appendChild(step);
  }

  function showError(msg) {
    const progressEl = $('#submit-progress');
    if (progressEl) {
      progressEl.innerHTML = `<div class="alert alert-error">${msg}</div>`;
    }
  }

  function resetForm() {
    $('#entry-notes').value = '';
    $('#measurement-ph').value = '';
    $('#measurement-ec').value = '';
    $('#measurement-temp').value = '';
    selectedFiles = [];
    renderPhotoPreviews();
  }

  // ── Start ───────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
