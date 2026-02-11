/* site.js — Journal browsing and rendering */

(function () {
  'use strict';

  // Base path for data files — data and images now live inside docs/
  const BASE = './';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];

  const contentEl = $('#content');
  const searchInput = $('#search-input');

  let experiments = [];
  let currentExperiment = null;

  // ── Init ────────────────────────────────────────────

  async function init() {
    await loadExperiments();

    // Handle hash-based navigation
    window.addEventListener('hashchange', onHashChange);
    onHashChange();

    if (searchInput) {
      searchInput.addEventListener('input', onSearch);
    }

    // Nav bar "New Experiment" link
    const navNewExp = $('#nav-new-experiment');
    if (navNewExp) {
      navNewExp.addEventListener('click', (e) => {
        e.preventDefault();
        openNewExperimentDialog();
      });
    }
  }

  async function loadExperiments() {
    try {
      const res = await fetch(BASE + 'data/experiments.json');
      if (!res.ok) throw new Error('Failed to load experiments');
      const data = await res.json();
      experiments = data.experiments || [];
    } catch (err) {
      contentEl.innerHTML = `<div class="empty-state"><p>Could not load experiments.</p><p>${err.message}</p></div>`;
    }
  }

  // ── Routing ─────────────────────────────────────────

  function onHashChange() {
    const hash = window.location.hash.slice(1);
    if (hash) {
      showExperiment(hash);
    } else {
      showExperimentList();
    }
  }

  // ── Experiment List ─────────────────────────────────

  function showExperimentList() {
    currentExperiment = null;
    const searchBar = $('#search-bar');
    if (searchBar) searchBar.classList.remove('hidden');

    if (experiments.length === 0) {
      contentEl.innerHTML = '<div class="empty-state"><p>No experiments yet.</p><p>Create one from the submission app.</p></div>';
      return;
    }

    const filtered = filterExperiments(searchInput ? searchInput.value : '');
    contentEl.innerHTML = '<div class="experiment-list">' +
      filtered.map(renderExperimentCard).join('') +
      '</div>';

    // Bind click handlers
    $$('.experiment-card', contentEl).forEach(card => {
      card.addEventListener('click', () => {
        window.location.hash = card.dataset.id;
      });
    });


  }

  function renderExperimentCard(exp) {
    return `
      <article class="experiment-card" data-id="${exp.id}">
        <h3>${esc(exp.name)} <span class="status-badge ${exp.status}">${exp.status}</span></h3>
        <div class="meta">Started ${formatDate(exp.startDate)}</div>
        <p>${esc(exp.description)}</p>
      </article>
    `;
  }

  function filterExperiments(query) {
    if (!query) return experiments;
    const q = query.toLowerCase();
    return experiments.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q)
    );
  }

  function onSearch() {
    if (!currentExperiment) {
      showExperimentList();
    }
  }

  // ── Experiment Detail ───────────────────────────────

  async function showExperiment(id) {
    const exp = experiments.find(e => e.id === id);
    if (!exp) {
      contentEl.innerHTML = '<div class="empty-state"><p>Experiment not found.</p></div>';
      return;
    }

    currentExperiment = exp;
    const searchBar = $('#search-bar');
    if (searchBar) searchBar.classList.add('hidden');

    contentEl.innerHTML = `
      <div class="experiment-detail-header">
        <button class="back-btn" id="back-btn">&larr; Back</button>
        <h2>${esc(exp.name)}</h2>
        <span class="status-badge ${exp.status}">${exp.status}</span>
      </div>
      <p>${esc(exp.description)}</p>
      <div class="meta">Started ${formatDate(exp.startDate)}</div>
      <div id="chart-area"></div>
      <h3 style="margin-top:1.5rem">Entries</h3>
      <div id="entries-area" class="loading">Loading entries...</div>
    `;

    $('#back-btn').addEventListener('click', () => {
      window.location.hash = '';
    });

    await loadEntries(exp);
  }

  async function loadEntries(exp) {
    const entriesArea = $('#entries-area');

    try {
      const indexRes = await fetch(BASE + `data/experiments/${exp.id}/entries/index.json`);
      if (!indexRes.ok) throw new Error('No entries found');
      const indexData = await indexRes.json();
      const filenames = indexData.entries || [];

      if (filenames.length === 0) {
        entriesArea.innerHTML = '<div class="empty-state"><p>No entries yet.</p></div>';
        return;
      }

      // Fetch all entries in parallel
      const entries = await Promise.all(
        filenames.map(async (fname) => {
          const res = await fetch(BASE + `data/experiments/${exp.id}/entries/${fname}`);
          if (!res.ok) return null;
          return res.json();
        })
      );

      const validEntries = entries.filter(Boolean);

      // Sort newest first
      validEntries.sort((a, b) => {
        const da = a.date + (a.time || '');
        const db = b.date + (b.time || '');
        return db.localeCompare(da);
      });

      entriesArea.innerHTML = '<div class="entry-timeline">' +
        validEntries.map(renderEntry).join('') +
        '</div>';

      // Bind lightbox
      $$('.entry-images img', entriesArea).forEach(img => {
        img.addEventListener('click', () => openLightbox(img.src));
      });

      // Render measurement chart if we have data
      renderChart(validEntries, exp);

    } catch (err) {
      entriesArea.innerHTML = `<div class="empty-state"><p>Could not load entries.</p><p>${err.message}</p></div>`;
    }
  }

  function renderEntry(entry) {
    const images = (entry.images || [])
      .map(src => `<img src="${BASE}${src}" alt="Photo" loading="lazy">`)
      .join('');

    const measurements = renderMeasurements(entry.measurements);

    return `
      <article class="entry-card">
        <div class="entry-date">
          ${formatDate(entry.date)}
          ${entry.time ? `<span class="entry-time">${entry.time}</span>` : ''}
        </div>
        <div class="entry-notes">${esc(entry.notes)}</div>
        ${measurements}
        ${images ? `<div class="entry-images">${images}</div>` : ''}
      </article>
    `;
  }

  function renderMeasurements(m) {
    if (!m) return '';
    const items = [];
    if (m.ph != null) items.push({ label: 'pH', value: m.ph, unit: '' });
    if (m.ec != null) items.push({ label: 'EC', value: m.ec, unit: 'mS/cm' });
    if (m.waterTemp != null) items.push({ label: 'Water Temp', value: m.waterTemp, unit: '°C' });

    if (items.length === 0) return '';

    return '<div class="measurements">' +
      items.map(i => `
        <div class="measurement">
          <div class="label">${i.label}</div>
          <div class="value">${i.value}<span class="unit"> ${i.unit}</span></div>
        </div>
      `).join('') +
      '</div>';
  }

  // ── Lightbox ────────────────────────────────────────

  function openLightbox(src) {
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `<img src="${src}" alt="Photo">`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handler);
      }
    });
    document.body.appendChild(overlay);
  }

  // ── Charts ──────────────────────────────────────────

  function renderChart(entries, exp) {
    const chartArea = $('#chart-area');
    if (!chartArea) return;

    // Need at least 2 data points for a meaningful chart
    const withMeasurements = entries
      .filter(e => e.measurements && (e.measurements.ph != null || e.measurements.ec != null || e.measurements.waterTemp != null))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (withMeasurements.length < 2) return;

    chartArea.innerHTML = `
      <div class="chart-container">
        <h4>Measurements Over Time</h4>
        <canvas id="measurements-chart"></canvas>
      </div>
    `;

    // Load Chart.js dynamically
    if (typeof Chart === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
      script.onload = () => buildChart(withMeasurements);
      document.head.appendChild(script);
    } else {
      buildChart(withMeasurements);
    }
  }

  function buildChart(entries) {
    const ctx = document.getElementById('measurements-chart');
    if (!ctx) return;

    const labels = entries.map(e => e.date);
    const datasets = [];

    const phData = entries.map(e => e.measurements.ph ?? null);
    const ecData = entries.map(e => e.measurements.ec ?? null);
    const tempData = entries.map(e => e.measurements.waterTemp ?? null);

    if (phData.some(v => v != null)) {
      datasets.push({
        label: 'pH',
        data: phData,
        borderColor: '#2d8a4e',
        backgroundColor: 'rgba(45,138,78,0.1)',
        yAxisID: 'y',
        tension: 0.3,
        spanGaps: true
      });
    }
    if (ecData.some(v => v != null)) {
      datasets.push({
        label: 'EC (mS/cm)',
        data: ecData,
        borderColor: '#1976d2',
        backgroundColor: 'rgba(25,118,210,0.1)',
        yAxisID: 'y',
        tension: 0.3,
        spanGaps: true
      });
    }
    if (tempData.some(v => v != null)) {
      datasets.push({
        label: 'Water Temp (°C)',
        data: tempData,
        borderColor: '#ef6c00',
        backgroundColor: 'rgba(239,108,0,0.1)',
        yAxisID: 'y1',
        tension: 0.3,
        spanGaps: true
      });
    }

    new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'pH / EC' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: '°C' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  // ── New Experiment Dialog ────────────────────────────

  function openNewExperimentDialog() {
    const dialog = $('#new-experiment-dialog');
    if (!dialog) return;

    const startInput = $('#exp-start');
    if (startInput) startInput.value = new Date().toISOString().split('T')[0];

    // Auto-generate ID from name
    const nameInput = $('#exp-name');
    const idInput = $('#exp-id');
    if (nameInput && idInput) {
      nameInput.addEventListener('input', () => {
        const year = new Date().getFullYear();
        idInput.value = nameInput.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') + '-' + year;
      });
    }

    const cancelBtn = $('#cancel-experiment');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => dialog.close());
    }

    const form = $('#new-experiment-form');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        await createNewExperiment();
      };
    }

    dialog.showModal();
  }

  async function createNewExperiment() {
    const statusEl = $('#new-exp-status');
    const dialog = $('#new-experiment-dialog');

    const id = $('#exp-id').value.trim();
    const name = $('#exp-name').value.trim();
    const description = ($('#exp-description').value || '').trim();
    const startDate = $('#exp-start').value;

    if (!id || !name || !startDate) return;

    statusEl.innerHTML = '<div class="alert alert-success">Creating experiment...</div>';

    const token = Auth.getToken();
    const owner = Auth.getOwner();
    const repo = Auth.getRepo();

    try {
      // 1. Read current experiments.json
      let expData = await GitHubAPI.getFileContent(token, owner, repo, 'docs/data/experiments.json');
      if (!expData) expData = { experiments: [] };

      // Check for duplicate ID
      if (expData.experiments.some(e => e.id === id)) {
        statusEl.innerHTML = '<div class="alert alert-error">An experiment with this ID already exists.</div>';
        return;
      }

      // 2. Add new experiment
      const newExp = { id, name, description, startDate, status: 'active' };
      expData.experiments.push(newExp);

      // 3. Build all files to commit
      const meta = {
        id, name, description, startDate,
        status: 'active',
        system: '',
        plants: [],
        nutrients: ''
      };

      const files = [
        { path: 'docs/data/experiments.json', content: JSON.stringify(expData, null, 2) },
        { path: `docs/data/experiments/${id}/meta.json`, content: JSON.stringify(meta, null, 2) },
        { path: `docs/data/experiments/${id}/entries/index.json`, content: JSON.stringify({ entries: [] }, null, 2) }
      ];

      // 4. Commit
      await GitHubAPI.commitFiles(token, owner, repo, `experiment: create ${id}`, files);

      statusEl.innerHTML = '<div class="alert alert-success">Experiment created!</div>';

      // 5. Refresh the list
      experiments.push(newExp);
      setTimeout(() => {
        dialog.close();
        showExperimentList();
      }, 1000);

    } catch (err) {
      statusEl.innerHTML = `<div class="alert alert-error">Error: ${err.message}</div>`;
    }
  }

  // ── Helpers ─────────────────────────────────────────

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ── Expose for new-experiment feature ───────────────

  window.HydroJournal = { loadExperiments, showExperimentList, experiments: () => experiments };

  // ── Start ───────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
