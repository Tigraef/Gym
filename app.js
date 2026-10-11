'use strict';

// ---------- Daten ----------

const STORAGE_KEY = 'gymtracker.v1';
const CATEGORIES = ['Brust', 'Rücken', 'Beine', 'Schultern', 'Arme', 'Bauch', 'Cardio', 'Sonstiges'];

const emptyDb = () => ({ version: 1, studios: [], machines: [], sessions: [] });

function isValidDb(d) {
  return d && typeof d === 'object' &&
    Array.isArray(d.studios) && Array.isArray(d.machines) && Array.isArray(d.sessions);
}

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (isValidDb(d)) return d;
    }
  } catch (e) { /* leer starten */ }
  return emptyDb();
}

let db = loadDb();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    toast('Speichern fehlgeschlagen – bitte Daten exportieren!');
  }
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const studioById = (id) => db.studios.find((s) => s.id === id);
const machineById = (id) => db.machines.find((m) => m.id === id);

// Alle Geräte, die mit diesem Gerät verbunden sind (inkl. sich selbst).
function linkedMachines(m) {
  if (!m.linkId) return [m];
  return db.machines.filter((x) => x.linkId === m.linkId);
}

// Trainings der ganzen Gerätegruppe, neueste zuerst.
function groupSessions(m) {
  const ids = new Set(linkedMachines(m).map((x) => x.id));
  return db.sessions
    .filter((s) => ids.has(s.machineId))
    .sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt || 0) - (a.createdAt || 0));
}

const lastSession = (m) => groupSessions(m)[0] || null;

function bestSet(m) {
  let best = null;
  for (const s of groupSessions(m)) {
    for (const set of s.sets) {
      if (!best || set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps)) {
        best = { ...set, date: s.date };
      }
    }
  }
  return best;
}

function linkMachines(a, b) {
  const target = a.linkId || b.linkId || uid();
  const merge = new Set([a.linkId, b.linkId].filter(Boolean));
  for (const m of db.machines) {
    if (m === a || m === b || merge.has(m.linkId)) m.linkId = target;
  }
}

// Gruppen mit nur einem Gerät auflösen.
function cleanupLinks() {
  const counts = {};
  for (const m of db.machines) if (m.linkId) counts[m.linkId] = (counts[m.linkId] || 0) + 1;
  for (const m of db.machines) if (m.linkId && counts[m.linkId] < 2) m.linkId = null;
}

function deleteMachine(id) {
  db.machines = db.machines.filter((m) => m.id !== id);
  db.sessions = db.sessions.filter((s) => s.machineId !== id);
  cleanupLinks();
}

function deleteStudio(id) {
  for (const m of db.machines.filter((x) => x.studioId === id)) deleteMachine(m.id);
  db.studios = db.studios.filter((s) => s.id !== id);
}

// ---------- Hilfen ----------

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const numFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const fmtNum = (n) => numFmt.format(n);

function parseNum(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fmtSets(sets) {
  return sets.map((s) => `${fmtNum(s.weight)} kg × ${s.reps}`).join(', ');
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

const dialog = document.getElementById('dialog');

// Formular-Dialog. onSubmit(formData, form) -> false hält den Dialog offen.
function openDialog(html, onSubmit, onMount) {
  dialog.innerHTML = `<form class="dlg" method="dialog">${html}</form>`;
  const form = dialog.querySelector('form');
  form.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    if (onSubmit && onSubmit(new FormData(form), form) === false) return;
    dialog.close();
  });
  if (onMount) onMount(form);
  dialog.showModal();
}

const dialogActions = (label = 'Speichern') => `
  <div class="actions">
    <button class="btn" value="cancel" formnovalidate>Abbrechen</button>
    <button class="btn primary" value="ok">${label}</button>
  </div>`;

function setHeader(title, subtitle = '', back = null) {
  document.getElementById('title').textContent = title;
  document.getElementById('subtitle').textContent = subtitle;
  const b = document.getElementById('back');
  b.hidden = !back;
  if (back) b.setAttribute('href', back);
  document.title = title === 'Gym Tracker' ? title : `${title} · Gym Tracker`;
}

const app = document.getElementById('app');

// ---------- Ansicht: Studios ----------

function renderStudios() {
  setHeader('Gym Tracker', 'Deine Studios');
  const studios = [...db.studios].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  app.innerHTML = `
    ${studios.length ? `<div class="list">${studios.map((s) => {
      const n = db.machines.filter((m) => m.studioId === s.id).length;
      return `<a class="card" href="#/studio/${s.id}">
        <div class="grow"><div class="name">${esc(s.name)}</div>
        <div class="meta">${n} ${n === 1 ? 'Gerät' : 'Geräte'}${s.notes ? ' · ' + esc(s.notes) : ''}</div></div>
        <span class="chev">›</span></a>`;
    }).join('')}</div>` : `<div class="empty">Noch keine Studios.<br>Lege dein erstes Studio an, z. B. „FitX Innenstadt“.</div>`}
    <button class="btn primary fab" id="add-studio">＋ Studio</button>`;
  app.querySelector('#add-studio').onclick = () => studioDialog();
}

function studioDialog(studio) {
  openDialog(`
    <h3>${studio ? 'Studio bearbeiten' : 'Neues Studio'}</h3>
    <label for="f-name">Name</label>
    <input id="f-name" name="name" required maxlength="80" value="${esc(studio?.name)}" placeholder="z. B. FitX Innenstadt">
    <label for="f-notes">Notiz (optional)</label>
    <input id="f-notes" name="notes" maxlength="200" value="${esc(studio?.notes)}" placeholder="z. B. Adresse, Öffnungszeiten">
    ${dialogActions()}`, (fd) => {
    const name = fd.get('name').trim();
    if (!name) return false;
    if (studio) {
      Object.assign(studio, { name, notes: fd.get('notes').trim() });
    } else {
      const s = { id: uid(), name, notes: fd.get('notes').trim() };
      db.studios.push(s);
      location.hash = `#/studio/${s.id}`;
    }
    save();
    render();
  });
}

// ---------- Ansicht: Geräte eines Studios ----------

let studioSearch = '';

function renderStudio(id) {
  const studio = studioById(id);
  if (!studio) return notFound();
  setHeader(studio.name, 'Geräte', '#/');

  app.innerHTML = `
    <input class="search" type="search" id="search" placeholder="Gerät suchen…" value="${esc(studioSearch)}">
    <div id="machines"></div>
    <h2>Studio</h2>
    <div class="row">
      <button class="btn" id="edit-studio">Bearbeiten</button>
      <button class="btn danger" id="del-studio">Löschen</button>
    </div>
    <button class="btn primary fab" id="add-machine">＋ Gerät</button>`;

  const list = app.querySelector('#machines');
  const draw = () => {
    const q = norm(studioSearch);
    const machines = db.machines
      .filter((m) => m.studioId === id && (!q || norm(m.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!machines.length) {
      list.innerHTML = `<div class="empty">${q ? 'Kein Gerät gefunden.' : 'Noch keine Geräte in diesem Studio.'}</div>`;
      return;
    }
    list.innerHTML = CATEGORIES.map((cat) => {
      const ms = machines.filter((m) => (m.category || 'Sonstiges') === cat);
      if (!ms.length) return '';
      return `<h2>${esc(cat)}</h2><div class="list">${ms.map(machineCard).join('')}</div>`;
    }).join('');
  };
  draw();

  const search = app.querySelector('#search');
  search.oninput = () => { studioSearch = search.value; draw(); };
  app.querySelector('#add-machine').onclick = () => machineDialog(studio);
  app.querySelector('#edit-studio').onclick = () => studioDialog(studio);
  app.querySelector('#del-studio').onclick = () => {
    if (!confirm(`Studio „${studio.name}“ mit allen Geräten und Trainings löschen?`)) return;
    deleteStudio(id);
    save();
    location.hash = '#/';
  };
}

function machineCard(m) {
  const last = lastSession(m);
  const linked = linkedMachines(m).length > 1;
  const lastTxt = last
    ? `Zuletzt ${fmtDate(last.date)}: ${esc(fmtSets(last.sets.slice(0, 1)))}${last.sets.length > 1 ? ` (+${last.sets.length - 1})` : ''}`
    : 'Noch kein Training';
  return `<a class="card" href="#/machine/${m.id}">
    <div class="grow"><div class="name">${esc(m.name)} ${linked ? '<span class="badge" title="Mit anderen Studios verbunden">🔗 verbunden</span>' : ''}</div>
    <div class="meta">${lastTxt}</div></div>
    <span class="chev">›</span></a>`;
}

function machineDialog(studio, machine) {
  const others = db.machines.filter((m) => m.studioId !== studio.id);
  const otherStudios = db.studios.filter((s) => others.some((m) => m.studioId === s.id));
  const linkSelect = !machine && others.length ? `
    <label for="f-link">Gleiches Gerät wie … (optional)</label>
    <select id="f-link" name="link">
      <option value="">— nicht verbinden —</option>
      ${otherStudios.map((s) => `<optgroup label="${esc(s.name)}">${others.filter((m) => m.studioId === s.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</optgroup>`).join('')}
    </select>
    <div class="muted" style="font-size:.8rem;margin-top:4px">Verbundene Geräte teilen sich Gewichte &amp; Wiederholungen.</div>` : '';

  openDialog(`
    <h3>${machine ? 'Gerät bearbeiten' : 'Neues Gerät'}</h3>
    <label for="f-name">Name</label>
    <input id="f-name" name="name" required maxlength="80" value="${esc(machine?.name)}" placeholder="z. B. Beinpresse" autocomplete="off">
    <div class="suggest" id="suggest"></div>
    <label for="f-cat">Kategorie</label>
    <select id="f-cat" name="category">
      ${CATEGORIES.map((c) => `<option ${c === (machine?.category || 'Sonstiges') ? 'selected' : ''}>${c}</option>`).join('')}
    </select>
    ${linkSelect}
    <label for="f-settings">Einstellungen in diesem Studio (optional)</label>
    <input id="f-settings" name="settings" maxlength="200" value="${esc(machine?.settings)}" placeholder="z. B. Sitz 4, Rückenlehne 2">
    <label for="f-notes">Notiz (optional)</label>
    <textarea id="f-notes" name="notes" maxlength="1000">${esc(machine?.notes)}</textarea>
    ${dialogActions()}`, (fd) => {
    const name = fd.get('name').trim();
    if (!name) return false;
    const data = {
      name,
      category: fd.get('category'),
      settings: fd.get('settings').trim(),
      notes: fd.get('notes').trim(),
    };
    if (machine) {
      Object.assign(machine, data);
    } else {
      const m = { id: uid(), studioId: studio.id, linkId: null, ...data };
      db.machines.push(m);
      const target = fd.get('link') && machineById(fd.get('link'));
      if (target) linkMachines(m, target);
      toast(target ? 'Gerät angelegt und verbunden' : 'Gerät angelegt');
    }
    save();
    render();
  }, (form) => {
    const sel = form.querySelector('#f-link');
    if (!sel) return;
    const nameIn = form.querySelector('#f-name');
    const catIn = form.querySelector('#f-cat');
    const sug = form.querySelector('#suggest');
    sel.onchange = () => {
      const t = machineById(sel.value);
      if (!t) return;
      if (!nameIn.value.trim()) nameIn.value = t.name;
      catIn.value = t.category || 'Sonstiges';
    };
    nameIn.oninput = () => {
      const q = norm(nameIn.value);
      const hits = q.length < 2 ? [] : others.filter((m) => norm(m.name).includes(q) || q.includes(norm(m.name))).slice(0, 4);
      sug.innerHTML = hits.map((m) => `<button type="button" data-id="${m.id}">🔗 ${esc(m.name)} · ${esc(studioById(m.studioId)?.name)}</button>`).join('');
      sug.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          sel.value = b.dataset.id;
          nameIn.value = machineById(b.dataset.id).name;
          sel.onchange();
          sug.innerHTML = '';
        };
      });
    };
  });
}

// ---------- Ansicht: Gerät ----------

function renderMachine(id) {
  const m = machineById(id);
  if (!m) return notFound();
  const studio = studioById(m.studioId);
  setHeader(m.name, studio ? studio.name : '', `#/studio/${m.studioId}`);

  const group = linkedMachines(m);
  const linked = group.length > 1;
  const sessions = groupSessions(m);
  const last = sessions[0];
  const best = bestSet(m);
  const others = group.filter((x) => x.id !== m.id);
  const studioTag = (s) => {
    if (!linked) return '';
    const sm = machineById(s.machineId);
    const st = sm && studioById(sm.studioId);
    return st ? ` <span class="badge">${esc(st.name)}</span>` : '';
  };

  app.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="label">Letztes Training</div>
        <div class="value">${last ? fmtNum(Math.max(...last.sets.map((s) => s.weight))) + ' kg' : '–'}</div>
        <div class="sub">${last ? fmtDate(last.date) + (linked ? ' · ' + esc(studioById(machineById(last.machineId)?.studioId)?.name || '') : '') : 'noch nichts eingetragen'}</div></div>
      <div class="stat"><div class="label">Bestwert</div>
        <div class="value">${best ? fmtNum(best.weight) + ' kg' : '–'}</div>
        <div class="sub">${best ? `× ${best.reps} · ${fmtDate(best.date)}` : ''}</div></div>
    </div>

    <h2>Training eintragen</h2>
    <form class="panel" id="log">
      <label for="l-date" style="margin-top:0">Datum</label>
      <input id="l-date" type="date" name="date" value="${today()}" required>
      <label>Sätze</label>
      <div class="set-row set-head"><span></span><span>Gewicht (kg)</span><span>Wdh.</span><span></span></div>
      <div class="sets" id="sets"></div>
      <div class="row" style="margin-top:8px"><button type="button" class="btn small" id="add-set">＋ Satz</button></div>
      <label for="l-note">Notiz (optional)</label>
      <input id="l-note" name="note" maxlength="200" placeholder="z. B. letzter Satz schwer">
      <button class="btn primary block" style="margin-top:12px">Speichern</button>
      ${last ? `<div class="muted" style="font-size:.8rem;margin-top:8px">Vorausgefüllt mit dem letzten Training${linked ? ' (aus allen verbundenen Studios)' : ''}.</div>` : ''}
    </form>

    <h2>Verbundene Geräte</h2>
    <div class="panel">
      ${linked ? `<div class="list">${others.map((o) => `<a class="card" href="#/machine/${o.id}"><div class="grow">
          <div class="name">${esc(o.name)}</div><div class="meta">${esc(studioById(o.studioId)?.name || '')}</div></div><span class="chev">›</span></a>`).join('')}</div>
        <p class="muted" style="font-size:.85rem">Gewichte und Wiederholungen werden zwischen diesen Geräten geteilt.</p>`
        : `<p class="muted" style="margin-top:0">Steht dasselbe Gerät auch in einem anderen Studio? Verbinde es, dann gilt dein Fortschritt überall.</p>`}
      <div class="row">
        <button class="btn" id="link">🔗 Verbinden…</button>
        ${linked ? '<button class="btn danger" id="unlink">Trennen</button>' : ''}
      </div>
    </div>

    <h2>Gerät in diesem Studio</h2>
    <div class="panel">
      <div><span class="muted">Kategorie:</span> ${esc(m.category || 'Sonstiges')}</div>
      <div><span class="muted">Einstellungen:</span> ${m.settings ? esc(m.settings) : '<span class="muted">–</span>'}</div>
      ${m.notes ? `<div class="pre" style="margin-top:6px">${esc(m.notes)}</div>` : ''}
      <div class="row" style="margin-top:10px">
        <button class="btn" id="edit">Bearbeiten</button>
        <button class="btn danger" id="del">Löschen</button>
      </div>
    </div>

    <h2>Verlauf${linked ? ' (alle verbundenen Studios)' : ''}</h2>
    ${sessions.length ? `<div class="list">${sessions.map((s) => `
      <div class="card session">
        <div class="grow">
          <div class="date">${fmtDate(s.date)}${studioTag(s)}</div>
          <div class="sets-text">${esc(fmtSets(s.sets))}</div>
          ${s.note ? `<div class="meta">${esc(s.note)}</div>` : ''}
        </div>
        <button class="icon-btn del" data-del="${s.id}" aria-label="Eintrag löschen">✕</button>
      </div>`).join('')}</div>` : '<div class="empty">Noch keine Trainings.</div>'}`;

  // Sätze-Editor
  const setsEl = app.querySelector('#sets');
  const addRow = (weight = '', reps = '') => {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `<span class="n"></span>
      <input name="weight" inputmode="decimal" placeholder="kg" value="${esc(weight === '' ? '' : String(weight).replace('.', ','))}" aria-label="Gewicht in kg">
      <input name="reps" inputmode="numeric" placeholder="Wdh." value="${esc(reps)}" aria-label="Wiederholungen">
      <button type="button" class="icon-btn del" aria-label="Satz entfernen">✕</button>`;
    row.querySelector('button').onclick = () => { row.remove(); renumber(); };
    setsEl.appendChild(row);
    renumber();
    return row;
  };
  const renumber = () => setsEl.querySelectorAll('.set-row').forEach((r, i) => { r.querySelector('.n').textContent = i + 1; });
  if (last) last.sets.forEach((s) => addRow(s.weight, s.reps));
  else addRow();

  app.querySelector('#add-set').onclick = () => {
    const rows = setsEl.querySelectorAll('.set-row');
    const prev = rows[rows.length - 1];
    const row = addRow(prev ? prev.querySelector('[name=weight]').value.replace(',', '.') : '', prev ? prev.querySelector('[name=reps]').value : '');
    row.querySelector('[name=weight]').focus();
  };

  app.querySelector('#log').onsubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const sets = [];
    for (const r of setsEl.querySelectorAll('.set-row')) {
      const w = parseNum(r.querySelector('[name=weight]').value);
      const reps = parseInt(r.querySelector('[name=reps]').value, 10);
      if (w === null && !reps) continue;
      if (w === null || !Number.isFinite(reps) || reps < 0 || w < 0) {
        toast('Bitte Gewicht und Wiederholungen ausfüllen');
        return;
      }
      sets.push({ weight: w, reps });
    }
    if (!sets.length) { toast('Mindestens einen Satz eintragen'); return; }
    db.sessions.push({
      id: uid(),
      machineId: m.id,
      date: form.date.value || today(),
      sets,
      note: form.note.value.trim(),
      createdAt: Date.now(),
    });
    save();
    toast('Training gespeichert 💪');
    render();
  };

  app.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      if (!confirm('Diesen Eintrag löschen?')) return;
      db.sessions = db.sessions.filter((s) => s.id !== b.dataset.del);
      save();
      render();
    };
  });

  app.querySelector('#link').onclick = () => linkDialog(m);
  const unlink = app.querySelector('#unlink');
  if (unlink) unlink.onclick = () => {
    if (!confirm('Verbindung trennen? Die Einträge bleiben beim jeweiligen Gerät erhalten.')) return;
    m.linkId = null;
    cleanupLinks();
    save();
    toast('Verbindung getrennt');
    render();
  };
  app.querySelector('#edit').onclick = () => machineDialog(studio, m);
  app.querySelector('#del').onclick = () => {
    if (!confirm(`Gerät „${m.name}“ und seine Einträge in diesem Studio löschen?`)) return;
    deleteMachine(m.id);
    save();
    location.hash = `#/studio/${m.studioId}`;
  };
}

function linkDialog(m) {
  const groupIds = new Set(linkedMachines(m).map((x) => x.id));
  const candidates = db.machines.filter((x) => x.studioId !== m.studioId && !groupIds.has(x.id));
  if (!candidates.length) {
    toast('Keine Geräte in anderen Studios vorhanden');
    return;
  }
  openDialog(`
    <h3>Verbinden mit …</h3>
    <p class="muted" style="margin:0 0 8px;font-size:.9rem">Wähle dasselbe Gerät aus einem anderen Studio.</p>
    <input type="search" id="pick-q" placeholder="Suchen…" value="${esc(m.name)}">
    <div class="pick-list" id="pick"></div>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Abbrechen</button></div>`, null, (form) => {
    const q = form.querySelector('#pick-q');
    const list = form.querySelector('#pick');
    const draw = () => {
      const nq = norm(q.value);
      let hits = candidates.filter((c) => !nq || norm(c.name).includes(nq) || nq.includes(norm(c.name)));
      if (!hits.length) hits = candidates;
      list.innerHTML = db.studios.map((s) => {
        const ms = hits.filter((c) => c.studioId === s.id).sort((a, b) => a.name.localeCompare(b.name, 'de'));
        if (!ms.length) return '';
        return `<div class="pick-group">${esc(s.name)}</div>` +
          ms.map((c) => `<button type="button" data-id="${c.id}">${esc(c.name)}${linkedMachines(c).length > 1 ? ' 🔗' : ''}</button>`).join('');
      }).join('');
      list.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          linkMachines(m, machineById(b.dataset.id));
          save();
          dialog.close();
          toast('Geräte verbunden 🔗');
          render();
        };
      });
    };
    q.oninput = draw;
    draw();
  });
}

// ---------- Ansicht: Daten ----------

function renderSettings() {
  setHeader('Daten', 'Sicherung & Übertragung', '#/');
  app.innerHTML = `
    <div class="panel">
      <p style="margin-top:0">Deine Daten werden nur in diesem Browser gespeichert:
      <b>${db.studios.length}</b> Studios, <b>${db.machines.length}</b> Geräte, <b>${db.sessions.length}</b> Trainings.</p>
      <p class="muted" style="font-size:.9rem">Exportiere regelmäßig eine Sicherung. Mit der Datei kannst du deine Daten auch auf ein anderes Gerät übertragen.</p>
      <div class="row">
        <button class="btn primary" id="export">Exportieren</button>
        <button class="btn" id="import">Importieren</button>
      </div>
      <input type="file" id="file" accept="application/json,.json" hidden>
    </div>
    <h2>Gefahrenzone</h2>
    <div class="panel"><button class="btn danger block" id="wipe">Alle Daten löschen</button></div>`;

  app.querySelector('#export').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-tracker-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const file = app.querySelector('#file');
  app.querySelector('#import').onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!isValidDb(d)) throw new Error('invalid');
      if (!confirm(`Import ersetzt alle aktuellen Daten (${d.studios.length} Studios, ${d.machines.length} Geräte, ${d.sessions.length} Trainings). Fortfahren?`)) return;
      db = { ...emptyDb(), ...d };
      save();
      toast('Daten importiert');
      render();
    } catch (e) {
      toast('Ungültige Datei');
    } finally {
      file.value = '';
    }
  };
  app.querySelector('#wipe').onclick = () => {
    if (!confirm('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.')) return;
    db = emptyDb();
    save();
    toast('Alle Daten gelöscht');
    render();
  };
}

function notFound() {
  setHeader('Nicht gefunden', '', '#/');
  app.innerHTML = '<div class="empty">Diese Seite gibt es nicht (mehr).</div>';
}

// ---------- Routing ----------

let lastRoute = '';

function render() {
  const [, view, id] = (location.hash || '#/').split('/');
  const route = `${view}/${id}`;
  if (route !== lastRoute) {
    if (view !== 'studio') studioSearch = '';
    lastRoute = route;
    window.scrollTo(0, 0);
  }
  if (dialog.open) dialog.close();
  if (view === 'studio' && id) renderStudio(id);
  else if (view === 'machine' && id) renderMachine(id);
  else if (view === 'settings') renderSettings();
  else renderStudios();
}

window.addEventListener('hashchange', render);
render();

// Browser bitten, die Daten nicht automatisch zu löschen.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
