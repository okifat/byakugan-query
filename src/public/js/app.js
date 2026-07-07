// ============================
// Byakugan Query
// ============================

let editor = null;
let schemaEditor = null;
let currentDB = 'postgresql';
let fileQueue = []; // [{id, name, content, size}]

const TEMPLATES = {
  postgresql: {
    select: "SELECT id, name, email, created_at\nFROM users\nWHERE status = 'active'\nORDER BY created_at DESC\nLIMIT 10;",
    insert: "INSERT INTO users (name, email, age, created_at)\nVALUES ('John Doe', 'john@example.com', 25, NOW());",
    update: "UPDATE users\nSET name = 'Jane Doe', updated_at = NOW()\nWHERE id = 1;",
    delete: "DELETE FROM users\nWHERE id = 1;",
    join: "SELECT u.name, o.total, o.status\nFROM users u\nINNER JOIN orders o ON u.id = o.user_id\nWHERE o.status = 'completed'\nORDER BY o.total DESC;",
    subquery: "SELECT name, email\nFROM users\nWHERE id IN (\n  SELECT user_id\n  FROM orders\n  WHERE total > 1000000\n);",
    agg: "SELECT u.name, COUNT(o.id) AS order_count, SUM(o.total) AS total_spent\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nGROUP BY u.name\nHAVING COUNT(o.id) > 5\nORDER BY total_spent DESC;"
  },
  mysql: {
    select: "SELECT id, name, email, created_at\nFROM users\nWHERE status = 'active'\nORDER BY created_at DESC\nLIMIT 10;",
    insert: "INSERT INTO users (name, email, age, created_at)\nVALUES ('John Doe', 'john@example.com', 25, NOW());",
    update: "UPDATE users\nSET name = 'Jane Doe', updated_at = NOW()\nWHERE id = 1;",
    delete: "DELETE FROM users\nWHERE id = 1;",
    join: "SELECT u.name, o.total, o.status\nFROM users u\nINNER JOIN orders o ON u.id = o.user_id\nWHERE o.status = 'completed'\nORDER BY o.total DESC;",
    subquery: "SELECT name, email\nFROM users\nWHERE id IN (\n  SELECT user_id\n  FROM orders\n  WHERE total > 1000000\n);",
    agg: "SELECT u.name, COUNT(o.id) AS order_count, SUM(o.total) AS total_spent\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nGROUP BY u.name\nHAVING COUNT(o.id) > 5\nORDER BY total_spent DESC;"
  },
  mongodb: {
    select: '{\n  "status": "active",\n  "age": { "$gte": 18 }\n}',
    insert: '{\n  "$set": {\n    "name": "John Doe",\n    "email": "john@example.com"\n  }\n}',
    update: '{\n  "$set": {\n    "name": "Jane Doe"\n  }\n}',
    delete: '{\n  "status": "deleted"\n}',
    join: '{\n  "$lookup": {\n    "from": "orders",\n    "localField": "_id",\n    "foreignField": "user_id"\n  }\n}',
    subquery: '{\n  "$match": {\n    "user_id": { "$in": [] }\n  }\n}',
    agg: '[\n  { "$match": { "status": "active" } },\n  { "$group": {\n    "_id": "$user_id",\n    "total": { "$sum": 1 }\n  }}\n]'
  }
};

const SAMPLE_SCHEMAS = {
  postgresql: { tables: { users: { columns: { id: { type: 'INTEGER', primary: true }, name: { type: 'VARCHAR' }, email: { type: 'VARCHAR' }, status: { type: 'VARCHAR' } } }, orders: { columns: { id: { type: 'INTEGER', primary: true }, user_id: { type: 'INTEGER' }, total: { type: 'DECIMAL' }, status: { type: 'VARCHAR' } } } } },
  mysql: { tables: { users: { columns: { id: { type: 'INT', primary: true }, name: { type: 'VARCHAR(255)' }, email: { type: 'VARCHAR(255)' }, status: { type: 'VARCHAR(50)' } } }, orders: { columns: { id: { type: 'INT', primary: true }, user_id: { type: 'INT' }, total: { type: 'DECIMAL(10,2)' }, status: { type: 'VARCHAR(50)' } } } } },
  mongodb: { collections: { users: { fields: { _id: { type: 'ObjectId' }, name: { type: 'String' }, email: { type: 'String' }, status: { type: 'String' } } }, orders: { fields: { _id: { type: 'ObjectId' }, user_id: { type: 'ObjectId' }, total: { type: 'Number' }, status: { type: 'String' } } } } }
};

// ============================
// DB Selection
// ============================

function selectDB(db) {
  currentDB = db;
  document.querySelectorAll('.db-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.db === db);
  });
  if (editor) {
    editor.setOption('mode', db === 'mongodb' ? 'application/json' : 'text/x-sql');
  }
  if (schemaEditor) {
    schemaEditor.setValue(JSON.stringify(SAMPLE_SCHEMAS[db], null, 2));
  }
}

function loadTemplate(type) {
  if (editor) {
    editor.setValue(TEMPLATES[currentDB][type] || '');
  }
}

// ============================
// Schema
// ============================

function toggleSchema() {
  const panel = document.getElementById('schemaPanel');
  const chevron = document.getElementById('schemaChevron');
  const isHidden = panel.classList.contains('schema-hidden');
  if (isHidden) {
    panel.classList.remove('schema-hidden');
    panel.classList.add('schema-shown');
    chevron.style.transform = 'rotate(180deg)';
    setTimeout(() => schemaEditor && schemaEditor.refresh(), 50);
  } else {
    panel.classList.add('schema-hidden');
    panel.classList.remove('schema-shown');
    chevron.style.transform = '';
  }
}

function uploadSchema(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target.result);
      schemaEditor.setValue(JSON.stringify(json, null, 2));
    } catch (err) {
      alert('Invalid JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ============================
// File Queue
// ============================

function uploadFiles(event) {
  const files = Array.from(event.target.files);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      fileQueue.push({
        id: Date.now() + Math.random(),
        name: file.name,
        content: e.target.result,
        size: file.size
      });
      renderFileQueue();
      updateCounts();
    };
    reader.readAsText(file);
  });
  event.target.value = '';
}

function removeFile(id) {
  fileQueue = fileQueue.filter(f => f.id !== id);
  renderFileQueue();
  updateCounts();
}

function previewFile(id) {
  const file = fileQueue.find(f => f.id === id);
  if (file && editor) {
    editor.setValue(file.content);
  }
}

function renderFileQueue() {
  const container = document.getElementById('fileQueue');
  const countEl = document.getElementById('fileCount');
  countEl.textContent = fileQueue.length;

  if (fileQueue.length === 0) {
    container.innerHTML = `
      <div class="file-empty">
        <svg class="w-8 h-8 text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
        </svg>
        <span class="text-xs text-slate-600">No files uploaded yet</span>
      </div>`;
    return;
  }

  container.innerHTML = fileQueue.map(f => {
    const sizeStr = f.size > 1024 ? (f.size / 1024).toFixed(1) + ' KB' : f.size + ' B';
    const lines = f.content.split('\n').length;
    return `
      <div class="file-item">
        <div class="file-info">
          <svg class="w-4 h-4 text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div class="min-w-0">
            <div class="text-xs font-medium text-slate-300 truncate">${esc(f.name)}</div>
            <div class="text-[10px] text-slate-500">${lines} lines &middot; ${sizeStr}</div>
          </div>
        </div>
        <div class="file-actions">
          <button onclick="previewFile(${f.id})" class="file-action-btn" title="Load in editor">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          </button>
          <button onclick="removeFile(${f.id})" class="file-action-btn file-action-delete" title="Remove">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

function updateCounts() {
  const editorHasQuery = editor && editor.getValue().trim().length > 0;
  const total = (editorHasQuery ? 1 : 0) + fileQueue.length;
  document.getElementById('queryCount').textContent = total;
  document.getElementById('editorCount').textContent = editorHasQuery ? '1 query' : '0 queries';
}

// ============================
// Drag & Drop
// ============================

function initDragDrop() {
  const editorWrap = document.getElementById('editorWrap');
  const dropZone = document.getElementById('dropZone');
  let dragCounter = 0;

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) dropZone.classList.add('active');
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) dropZone.classList.remove('active');
  });

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.remove('active');

    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      if (/\.(sql|js|json|txt)$/i.test(file.name)) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          fileQueue.push({
            id: Date.now() + Math.random(),
            name: file.name,
            content: ev.target.result,
            size: file.size
          });
          renderFileQueue();
          updateCounts();
        };
        reader.readAsText(file);
      }
    });
  });
}

// ============================
// Validation
// ============================

async function validateAll() {
  const queries = [];

  // Editor query
  const editorQuery = editor ? editor.getValue().trim() : '';
  if (editorQuery) {
    queries.push({ source: 'editor', name: 'Query (editor)', query: editorQuery });
  }

  // File queue
  fileQueue.forEach(f => {
    queries.push({ source: 'file', name: f.name, query: f.content.trim() });
  });

  if (queries.length === 0) return;

  let schema = null;
  const schemaVal = schemaEditor ? schemaEditor.getValue().trim() : '';
  if (schemaVal) {
    try { schema = JSON.parse(schemaVal); } catch (err) { /* ignore */ }
  }

  const btn = document.getElementById('validateBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-sm"></div> Validating...';

  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('resultsList').innerHTML = '';
  document.getElementById('summaryBar').classList.add('hidden');

  try {
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ queries: queries.map(q => q.query), dbType: currentDB, schema })
    });
    const data = await res.json();

    // Merge source info
    if (data.results) {
      data.results.forEach((r, i) => {
        r.source = queries[i].source;
        r.name = queries[i].name;
      });
    }

    renderResults(data);
  } catch (err) {
    showError('Network error: ' + err.message);
  } finally {
    btn.disabled = false;
    const total = queries.length;
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Validate All <span id="queryCount" class="ml-1 px-1.5 py-0.5 rounded bg-white/10 text-[10px]">${total}</span>`;
    document.getElementById('loadingState').classList.add('hidden');
  }
}

// ============================
// Results
// ============================

function applyFix(index, fixedQuery) {
  editor.setValue(fixedQuery);
  resultsPanel.classList.remove('open');
}

function renderResults(data) {
  const { results, summary } = data;
  const list = document.getElementById('resultsList');

  document.getElementById('summaryBar').classList.remove('hidden');
  document.getElementById('summaryTotal').textContent = `${summary.total} total`;
  document.getElementById('summaryValid').textContent = `${summary.valid} valid`;
  document.getElementById('summaryInvalid').textContent = `${summary.invalid} invalid`;

  list.innerHTML = results.map((r, i) => {
    const ok = r.valid;
    const statusIcon = ok
      ? '<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
      : '<svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

    const name = r.name || `Query ${i + 1}`;
    const source = r.source === 'file' ? '<span class="text-[9px] px-1 py-0.5 rounded bg-violet-500/10 text-violet-400 ml-1">FILE</span>' : '';
    const preview = r.query.split('\n')[0].substring(0, 50) + (r.query.split('\n')[0].length > 50 ? '...' : '');

    const issues = [
      ...r.errors.map(e => ({ ...e, _type: 'error' })),
      ...r.warnings.map(e => ({ ...e, _type: 'warning' })),
      ...r.schemaIssues.map(e => ({ ...e, _type: 'schema' })),
      ...r.optimizations.map(e => ({ ...e, _type: 'optimization' })),
      ...r.suggestions.map(e => ({ ...e, _type: 'suggestion' }))
    ];

    const tuning = r.tuning || [];
    const fixes = r.fixes || [];
    const totalItems = issues.length + tuning.length;
    const badgeColor = ok ? (totalItems > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400') : 'bg-red-500/10 text-red-400';
    const badgeText = ok ? (totalItems > 0 ? `${totalItems} items` : 'Clean') : `${r.errors.length} error(s)`;

    // Tuning sections grouped by type
    const rewrites = tuning.filter(t => t.type === 'rewrite');
    const indexes = tuning.filter(t => t.type === 'index');
    const tips = tuning.filter(t => t.type === 'tip');

    // Fix section
    const fixButton = r.fixedQuery ? `
      <div class="fix-section">
        <div class="fix-section-label">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span class="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Auto-Fix Available</span>
        </div>
        <div class="fix-list">${fixes.map(f => `
          <div class="fix-item">
            <span class="fix-icon">${f.type === 'schema' ? '📝' : f.type === 'rewrite' ? '🔄' : '🔧'}</span>
            <span class="fix-desc">${esc(f.description)}</span>
            <span class="fix-detail">${esc(f.from)} → ${esc(f.to)}</span>
          </div>`).join('')}
        </div>
        <button class="fix-apply-btn" onclick="applyFix(${i}, ${esc(r.fixedQuery.replace(/'/g, "\\'").replace(/\n/g, "\\n"))})">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Apply Fix
        </button>
      </div>` : '';

    return `
      <div class="result-card animate-up" style="animation-delay: ${i * 0.04}s">
        <button class="result-header" onclick="toggleResult(this)">
          <div class="flex items-center gap-2 min-w-0">
            ${statusIcon}
            <span class="text-xs font-medium text-slate-300 truncate">${esc(name)}</span>
            ${source}
            <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${badgeColor} flex-shrink-0">${badgeText}</span>
          </div>
          <svg class="w-4 h-4 text-slate-500 transition-transform chevron flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        <div class="result-body">
          <pre class="result-query">${esc(r.query)}</pre>

          ${fixButton}

          ${issues.length > 0 ? '<div class="section-block"><div class="section-block-label"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span><span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Validation</span></div>' + issues.map(iss => renderIssue(iss)).join('') + '</div>' : ''}

          ${rewrites.length > 0 ? '<div class="section-block"><div class="section-block-label"><span class="w-1.5 h-1.5 rounded-full bg-cyan-500"></span><span class="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">Rewrite Suggestions</span></div>' + rewrites.map(t => renderTuningItem(t, 'rewrite')).join('') + '</div>' : ''}

          ${indexes.length > 0 ? '<div class="section-block"><div class="section-block-label"><span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span><span class="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">Index Recommendations</span></div>' + indexes.map(t => renderTuningItem(t, 'index')).join('') + '</div>' : ''}

          ${tips.length > 0 ? '<div class="section-block"><div class="section-block-label"><span class="w-1.5 h-1.5 rounded-full bg-violet-500"></span><span class="text-[11px] font-semibold text-violet-400 uppercase tracking-wider">Tips</span></div>' + tips.map(t => renderTuningItem(t, 'tip')).join('') + '</div>' : ''}

          ${issues.length === 0 && tuning.length === 0 && fixes.length === 0 ? '<div class="result-ok">All checks passed</div>' : ''}
        </div>
      </div>`;
  }).join('');
}

function renderTuningItem(t, type) {
  const styles = {
    rewrite: { border: 'border-cyan-500/12', bg: 'bg-cyan-500/4', title: 'text-cyan-300', detail: 'text-cyan-200/70', codeBg: 'bg-cyan-500/6', codeBorder: 'border-cyan-500/10', codeText: 'text-cyan-200' },
    index: { border: 'border-indigo-500/12', bg: 'bg-indigo-500/4', title: 'text-indigo-300', detail: 'text-indigo-200/70', codeBg: 'bg-indigo-500/6', codeBorder: 'border-indigo-500/10', codeText: 'text-indigo-200' },
    tip: { border: 'border-violet-500/12', bg: 'bg-violet-500/4', title: 'text-violet-300', detail: 'text-violet-200/70', codeBg: 'bg-violet-500/6', codeBorder: 'border-violet-500/10', codeText: 'text-violet-200' }
  };
  const s = styles[type] || styles.tip;

  let html = `<div class="tuning-item ${s.border} ${s.bg}">`;
  html += `<div class="font-medium text-sm ${s.title}">${esc(t.title)}</div>`;
  if (t.detail) html += `<div class="text-xs ${s.detail} mt-1">${esc(t.detail)}</div>`;
  if (t.example) html += `<pre class="tuning-code ${s.codeBg} border ${s.codeBorder} ${s.codeText}">${esc(t.example)}</pre>`;
  html += '</div>';
  return html;
}

function renderIssue(iss) {
  const colors = {
    error: { border: 'border-red-500/12', bg: 'bg-red-500/4', dot: 'bg-red-500', text: 'text-red-300', fixBg: 'bg-red-500/6', fixBorder: 'border-red-500/10', fixText: 'text-red-300', tagBg: 'bg-red-500/8', tagText: 'text-red-300' },
    warning: { border: 'border-amber-500/12', bg: 'bg-amber-500/4', dot: 'bg-amber-500', text: 'text-amber-300', fixBg: 'bg-amber-500/6', fixBorder: 'border-amber-500/10', fixText: 'text-amber-300', tagBg: 'bg-amber-500/8', tagText: 'text-amber-300' },
    schema: { border: 'border-orange-500/12', bg: 'bg-orange-500/4', dot: 'bg-orange-500', text: 'text-orange-300', fixBg: 'bg-orange-500/6', fixBorder: 'border-orange-500/10', fixText: 'text-orange-300', tagBg: 'bg-orange-500/8', tagText: 'text-orange-300' },
    optimization: { border: 'border-emerald-500/12', bg: 'bg-emerald-500/4', dot: 'bg-emerald-500', text: 'text-emerald-300', fixBg: 'bg-emerald-500/6', fixBorder: 'border-emerald-500/10', fixText: 'text-emerald-300', tagBg: 'bg-emerald-500/8', tagText: 'text-emerald-300' },
    suggestion: { border: 'border-blue-500/12', bg: 'bg-blue-500/4', dot: 'bg-blue-500', text: 'text-blue-300', fixBg: 'bg-blue-500/6', fixBorder: 'border-blue-500/10', fixText: 'text-blue-300', tagBg: 'bg-blue-500/8', tagText: 'text-blue-300' }
  };
  const c = colors[iss._type] || colors.error;
  const msg = iss.message || '';
  const fix = iss.fix || iss.suggestion || iss.detail || '';
  const available = iss.available || [];

  let html = `<div class="issue-item ${c.border} ${c.bg}">`;
  html += `<div class="flex items-start gap-2"><span class="w-1.5 h-1.5 rounded-full ${c.dot} mt-1.5 flex-shrink-0"></span><span class="${c.text} text-sm">${esc(msg)}</span></div>`;
  if (fix) html += `<div class="ml-3.5 mt-1.5 px-3 py-2 rounded-lg text-xs font-mono ${c.fixBg} border ${c.fixBorder} ${c.fixText}">${esc(fix)}</div>`;
  if (available.length > 0) {
    html += '<div class="ml-3.5 mt-2 flex flex-wrap gap-1">';
    html += available.slice(0, 6).map(a => `<span class="px-2 py-0.5 rounded text-[11px] font-mono ${c.tagBg} ${c.tagText}">${esc(a)}</span>`).join('');
    if (available.length > 6) html += `<span class="px-2 py-0.5 rounded text-[11px] font-mono ${c.tagBg} ${c.tagText}">+${available.length - 6}</span>`;
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function toggleResult(btn) {
  const card = btn.closest('.result-card');
  const body = card.querySelector('.result-body');
  const chevron = btn.querySelector('.chevron');
  const isOpen = body.classList.contains('open');

  if (isOpen) {
    body.classList.remove('open');
    body.style.maxHeight = '0';
    chevron.style.transform = '';
  } else {
    body.classList.add('open');
    body.style.maxHeight = body.scrollHeight + 'px';
    chevron.style.transform = 'rotate(180deg)';
  }
}

function clearResults() {
  document.getElementById('resultsList').innerHTML = '';
  document.getElementById('summaryBar').classList.add('hidden');
  document.getElementById('emptyState').classList.remove('hidden');
}

function showError(msg) {
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('resultsList').innerHTML = `
    <div class="result-card animate-up">
      <div class="flex items-center gap-3 p-4">
        <svg class="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <span class="text-sm text-red-300">${esc(msg)}</span>
      </div>
    </div>`;
}

function esc(str) {
  if (typeof str !== 'string') str = String(str);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================
// Connection Management
// ============================

let connections = [];
let selectedConnectionId = '';
let editingId = '';

async function loadConnections() {
  if (!window.USER) return;
  try {
    const res = await fetch('/api/connections', { headers: { 'Accept': 'application/json' } });
    connections = await res.json();
    renderConnectionSelect();
  } catch (err) {
    console.error('Failed to load connections:', err);
  }
}

function renderConnectionSelect() {
  const select = document.getElementById('connectionSelect');
  if (!select) return;

  select.innerHTML = '<option value="">— No connection —</option>';
  connections.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.type})`;
    select.appendChild(opt);
  });

  if (selectedConnectionId) {
    select.value = selectedConnectionId;
    onConnectionChange();
  }
}

function onConnectionChange() {
  const select = document.getElementById('connectionSelect');
  const fetchBtn = document.getElementById('fetchSchemaBtn');
  selectedConnectionId = select.value;
  fetchBtn.disabled = !selectedConnectionId;
}

async function fetchSchemaFromConn() {
  if (!selectedConnectionId) return;

  const btn = document.getElementById('fetchSchemaBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-sm"></div> Fetching...';

  try {
    const res = await fetch(`/api/schema/${selectedConnectionId}`, {
      headers: { 'Accept': 'application/json' }
    });
    const text = await res.text();
    let schema;
    try {
      schema = JSON.parse(text);
    } catch (e) {
      alert('Failed to fetch schema: server returned HTML (not logged in?)');
      return;
    }

    if (schema.error) {
      alert('Error: ' + schema.error);
      return;
    }

    schemaEditor.setValue(JSON.stringify(schema, null, 2));

    // Open schema panel
    const panel = document.getElementById('schemaPanel');
    if (panel.classList.contains('schema-hidden')) {
      toggleSchema();
    }

    // Show AUTO badge
    const badge = document.getElementById('schemaBadge');
    badge.classList.remove('hidden');
  } catch (err) {
    alert('Failed to fetch schema: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg> <span class="hidden sm:inline">Fetch Schema</span>';
  }
}

function openConnectionModal() {
  editingId = '';
  clearForm();
  updateFormUI();
  document.getElementById('connectionModal').classList.remove('hidden');
  renderConnectionList();
}

function closeConnectionModal() {
  document.getElementById('connectionModal').classList.add('hidden');
}

function renderConnectionList() {
  const list = document.getElementById('connectionList');
  if (connections.length === 0) {
    list.innerHTML = '<div class="text-xs text-slate-500 text-center py-4">No connections yet</div>';
    return;
  }

  list.innerHTML = connections.map(c => `
    <div class="conn-item">
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
        <div class="min-w-0">
          <div class="text-sm font-medium text-slate-200">${esc(c.name)}</div>
          <div class="text-[11px] text-slate-500">${esc(c.type)} · ${esc(c.host)}:${c.port}/${esc(c.database)}</div>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="testConnection('${c.id}')" class="file-action-btn" title="Test koneksi">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </button>
        <button onclick="editConnection('${c.id}')" class="file-action-btn" title="Edit koneksi">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </button>
        <button onclick="deleteConnection('${c.id}')" class="file-action-btn file-action-delete" title="Hapus koneksi">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

async function addConnection() {
  const data = {
    name: document.getElementById('connName').value.trim(),
    type: document.getElementById('connType').value,
    host: document.getElementById('connHost').value.trim(),
    port: parseInt(document.getElementById('connPort').value) || undefined,
    database: document.getElementById('connDatabase').value.trim(),
    username: document.getElementById('connUsername').value.trim(),
    password: document.getElementById('connPassword').value,
    ssl: document.getElementById('connSSL').checked
  };

  if (!data.name || !data.host || !data.database) {
    alert('Name, host, and database are required');
    return;
  }

  try {
    if (editingId) {
      // Edit mode: PUT
      if (!data.password) delete data.password;
      const res = await fetch(`/api/connections/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      });
      const updated = await res.json();
      const idx = connections.findIndex(c => c.id === editingId);
      if (idx !== -1) connections[idx] = { ...connections[idx], ...updated };
      editingId = '';
      updateFormUI();
    } else {
      // Add mode: POST
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      });
      const conn = await res.json();
      connections.push(conn);
    }

    renderConnectionList();
    renderConnectionSelect();
    clearForm();
  } catch (err) {
    alert('Failed: ' + err.message);
  }
}

function editConnection(id) {
  const conn = connections.find(c => c.id === id);
  if (!conn) return;

  editingId = id;
  document.getElementById('connName').value = conn.name || '';
  document.getElementById('connType').value = conn.type || 'postgresql';
  document.getElementById('connHost').value = conn.host || '';
  document.getElementById('connPort').value = conn.port || '';
  document.getElementById('connDatabase').value = conn.database || '';
  document.getElementById('connUsername').value = conn.username || '';
  document.getElementById('connPassword').value = '';
  document.getElementById('connSSL').checked = conn.ssl || false;
  document.getElementById('connTestResult').classList.add('hidden');
  updateFormUI();

  document.getElementById('connPassword').placeholder = 'Kosongkan jika tidak diubah';
}

function cancelEdit() {
  editingId = '';
  clearForm();
  updateFormUI();
}

function clearForm() {
  ['connName', 'connHost', 'connPort', 'connDatabase', 'connUsername', 'connPassword'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('connSSL').checked = false;
  document.getElementById('connTestResult').classList.add('hidden');
  document.getElementById('connPassword').placeholder = 'password';
}

function updateFormUI() {
  const btn = document.getElementById('connSubmitBtn');
  const cancelBtn = document.getElementById('connCancelBtn');
  const title = document.getElementById('connFormTitle');

  if (editingId) {
    btn.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Update';
    cancelBtn.classList.remove('hidden');
    title.textContent = 'Edit Connection';
  } else {
    btn.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg> Add Connection';
    cancelBtn.classList.add('hidden');
    title.textContent = 'Add New Connection';
  }
}

async function testConnection(id) {
  try {
    const res = await fetch(`/api/connections/${id}/test`, {
      method: 'POST',
      headers: { 'Accept': 'application/json' }
    });
    const result = await res.json();
    const item = document.querySelector(`[onclick="testConnection('${id}')"]`).closest('.conn-item');
    const indicator = item.querySelector('.w-2');

    if (result.success) {
      indicator.className = 'w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0';
    } else {
      indicator.className = 'w-2 h-2 rounded-full bg-red-500 flex-shrink-0';
      alert('Connection failed: ' + result.message);
    }
  } catch (err) {
    alert('Test failed: ' + err.message);
  }
}

async function testNewConnection() {
  const data = {
    type: document.getElementById('connType').value,
    host: document.getElementById('connHost').value.trim(),
    port: parseInt(document.getElementById('connPort').value) || undefined,
    database: document.getElementById('connDatabase').value.trim(),
    username: document.getElementById('connUsername').value.trim(),
    password: document.getElementById('connPassword').value,
    ssl: document.getElementById('connSSL').checked
  };

  if (!data.host || !data.database) {
    alert('Host and database are required');
    return;
  }

  const resultEl = document.getElementById('connTestResult');
  resultEl.classList.remove('hidden');
  resultEl.className = 'mt-2 text-xs text-slate-400';
  resultEl.textContent = 'Testing connection...';

  try {
    const res = await fetch('/api/connections/test-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      resultEl.className = 'mt-2 text-xs text-emerald-400';
      resultEl.textContent = 'Connection successful!';
    } else {
      resultEl.className = 'mt-2 text-xs text-red-400';
      resultEl.textContent = 'Failed: ' + result.message;
    }
  } catch (err) {
    resultEl.className = 'mt-2 text-xs text-red-400';
    resultEl.textContent = 'Error: ' + err.message;
  }
}

async function deleteConnection(id) {
  if (!confirm('Delete this connection?')) return;

  try {
    await fetch(`/api/connections/${id}`, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' }
    });
    connections = connections.filter(c => c.id !== id);
    renderConnectionList();
    renderConnectionSelect();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

// ============================
// Init
// ============================

document.addEventListener('DOMContentLoaded', () => {
  // Main editor
  const wrap = document.getElementById('editorWrap');
  const textarea = document.getElementById('queryInput');
  textarea.style.display = 'none';

  editor = CodeMirror.fromTextArea(textarea, {
    mode: 'text/x-sql',
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: true,
    styleActiveLine: true,
    placeholder: 'Write your query here...'
  });

  editor.on('change', updateCounts);

  // Make CodeMirror fill container
  const cmEl = wrap.querySelector('.CodeMirror');
  if (cmEl) {
    cmEl.style.height = '100%';
  }

  // Schema editor
  schemaEditor = CodeMirror.fromTextArea(document.getElementById('schemaInput'), {
    mode: 'application/json',
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: true,
    styleActiveLine: true,
    placeholder: '{\n  "tables": { ... }\n}'
  });
  schemaEditor.setValue(JSON.stringify(SAMPLE_SCHEMAS[currentDB], null, 2));

  // Drag & drop
  initDragDrop();

  // CONNECTION DISABLED — uncomment to re-enable
  // loadConnections();

  updateCounts();
});
