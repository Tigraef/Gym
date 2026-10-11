'use strict';

// ---------- Synchronisation über ein privates GitHub-Repository ----------
//
// Die Daten liegen weiterhin im Browser (localStorage) und die App funktioniert
// offline. Ist die Synchronisation eingerichtet, wird zusätzlich eine JSON-Datei
// in einem privaten Repository gelesen und geschrieben (GitHub Contents API).
//
// Zusammenführen (3-Wege-Merge pro Eintrag, über die id):
//   lokal  = aktuelle Daten in diesem Browser
//   remote = aktuelle Datei im Repository
//   basis  = Stand der letzten erfolgreichen Synchronisation dieses Geräts
// Was nur auf einer Seite geändert/gelöscht wurde, wird übernommen. Wurde ein
// Eintrag auf beiden Seiten geändert, gewinnt die neuere Änderung (updatedAt).
// Bearbeiten schlägt Löschen.

const GymSync = (() => {
  const CFG_KEY = 'gymtracker.sync.config';   // { repo: 'owner/name', token, path }
  const BASE_KEY = 'gymtracker.sync.base';    // { sha, data }
  const STATE_KEY = 'gymtracker.sync.state';  // { lastSyncAt, lastError }
  const COLLECTIONS = ['studios', 'machines', 'sessions'];
  const DEFAULT_PATH = 'gym-tracker.json';
  const API = 'https://api.github.com';

  // ----- Speicher -----

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  };
  const writeJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignorieren */ }
  };

  const config = () => readJson(CFG_KEY, null);
  const isConfigured = () => {
    const c = config();
    return !!(c && c.repo && c.token);
  };
  const state = () => readJson(STATE_KEY, {});
  const setState = (patch) => writeJson(STATE_KEY, { ...state(), ...patch });

  // ----- Vergleich & Zeitstempel -----

  // Stabiles JSON (sortierte Schlüssel), ohne updatedAt – zum Vergleichen von Inhalten.
  function canon(v) {
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).filter((k) => k !== 'updatedAt' && v[k] !== undefined).sort()
        .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
    }
    return JSON.stringify(v ?? null);
  }
  const same = (a, b) => canon(a) === canon(b);

  // Merkt sich den Inhalt jedes Eintrags, um Änderungen beim Speichern zu erkennen.
  let snapshot = new Map();
  function takeSnapshot() {
    snapshot = new Map();
    for (const c of COLLECTIONS) for (const r of db[c] || []) snapshot.set(`${c}:${r.id}`, canon(r));
  }

  // Wird von save() aufgerufen: geänderte oder neue Einträge bekommen updatedAt.
  function stamp() {
    const now = Date.now();
    for (const c of COLLECTIONS) {
      for (const r of db[c] || []) {
        if (!r || !r.id) continue;
        if (snapshot.get(`${c}:${r.id}`) !== canon(r)) r.updatedAt = now;
      }
    }
    takeSnapshot();
  }

  // ----- Zusammenführen -----

  function mergeCollection(local, remote, base) {
    const byId = (list) => new Map((list || []).filter((r) => r && r.id).map((r) => [r.id, r]));
    const L = byId(local), R = byId(remote), B = byId(base);
    const ids = [...L.keys(), ...[...R.keys()].filter((id) => !L.has(id))];
    const out = [];
    for (const id of ids) {
      const l = L.get(id), r = R.get(id), b = B.get(id);
      if (l && r) {
        if (same(l, r)) out.push(l);
        else if (b && same(l, b)) out.push(r);           // nur remote geändert
        else if (b && same(r, b)) out.push(l);           // nur lokal geändert
        else out.push((r.updatedAt || 0) > (l.updatedAt || 0) ? r : l); // beide: neuere gewinnt
      } else if (l) {
        if (!(b && same(l, b))) out.push(l);             // neu oder lokal bearbeitet; sonst remote gelöscht
      } else if (r) {
        if (!(b && same(r, b))) out.push(r);             // neu oder remote bearbeitet; sonst lokal gelöscht
      }
    }
    return out;
  }

  function mergeDb(local, remote, base) {
    const merged = { ...remote, ...local };
    for (const c of COLLECTIONS) merged[c] = mergeCollection(local[c], remote?.[c], base?.[c]);
    // Verwaiste Einträge entfernen (z. B. Studio auf einem Gerät gelöscht, Gerät auf dem anderen bearbeitet).
    const studioIds = new Set(merged.studios.map((s) => s.id));
    merged.machines = merged.machines.filter((m) => studioIds.has(m.studioId));
    const machineIds = new Set(merged.machines.map((m) => m.id));
    merged.sessions = merged.sessions.filter((s) => machineIds.has(s.machineId));
    return merged;
  }

  // Übernimmt das Ergebnis in das bestehende db-Objekt, ohne Objekte auszutauschen,
  // die die App gerade festhält (z. B. ein offener Bearbeiten-Dialog).
  function applyInPlace(merged) {
    let changed = false;
    for (const c of COLLECTIONS) {
      const existing = new Map((db[c] || []).map((r) => [r.id, r]));
      const next = merged[c].map((rec) => {
        const ex = existing.get(rec.id);
        if (!ex) { changed = true; return JSON.parse(JSON.stringify(rec)); }
        if (ex !== rec && canon(ex) !== canon(rec)) {
          for (const k of Object.keys(ex)) delete ex[k];
          Object.assign(ex, JSON.parse(JSON.stringify(rec)));
          changed = true;
        } else if (ex !== rec) {
          ex.updatedAt = rec.updatedAt;
        }
        return ex;
      });
      if (next.length !== (db[c] || []).length) changed = true;
      if (!Array.isArray(db[c])) db[c] = [];
      db[c].length = 0;
      db[c].push(...next);
    }
    if (typeof cleanupLinks === 'function') cleanupLinks();
    return changed;
  }

  const plain = (d) => {
    const out = { version: d.version || 1 };
    for (const c of COLLECTIONS) out[c] = d[c] || [];
    return JSON.parse(JSON.stringify(out));
  };

  // ----- GitHub -----

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
  }

  class SyncError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  async function gh(cfg, path, opts = {}) {
    let res;
    try {
      res = await fetch(`${API}${path}`, {
        ...opts,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${cfg.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch (e) {
      throw new SyncError('Keine Verbindung', 0);
    }
    if (res.status === 404 && opts.allow404) return null;
    if (!res.ok) {
      let msg = `GitHub-Fehler ${res.status}`;
      if (res.status === 401) msg = 'Token ungültig oder abgelaufen';
      else if (res.status === 403) msg = 'Kein Zugriff – Token-Berechtigung „Contents: Read and write“ prüfen';
      else if (res.status === 404) msg = 'Repository nicht gefunden oder Token hat keinen Zugriff darauf';
      else if (res.status === 409 || res.status === 422) msg = 'Konflikt';
      throw new SyncError(msg, res.status);
    }
    return res.json();
  }

  const filePath = (cfg) => (cfg.path || DEFAULT_PATH).split('/').map(encodeURIComponent).join('/');

  async function readRemote(cfg) {
    const f = await gh(cfg, `/repos/${cfg.repo}/contents/${filePath(cfg)}`, { allow404: true });
    if (!f) return { sha: null, data: null };
    let text;
    if (f.content) text = b64decode(f.content);
    else {
      // Dateien über 1 MB liefert die Contents-API ohne Inhalt – dann über die Blob-API holen.
      const blob = await gh(cfg, `/repos/${cfg.repo}/git/blobs/${f.sha}`);
      text = b64decode(blob.content);
    }
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* unten behandelt */ }
    if (!isValidDb(data)) throw new SyncError('Die Datei im Repository ist keine gültige Gym-Tracker-Datei', 0);
    return { sha: f.sha, data };
  }

  const deviceName = () => (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Handy' : 'PC');

  async function writeRemote(cfg, data, sha) {
    const body = {
      message: `Gym Tracker: Sync vom ${deviceName()}`,
      content: b64encode(JSON.stringify(data, null, 1) + '\n'),
      ...(sha ? { sha } : {}),
    };
    const res = await gh(cfg, `/repos/${cfg.repo}/contents/${filePath(cfg)}`, { method: 'PUT', body: JSON.stringify(body) });
    return res.content.sha;
  }

  // ----- Ablauf -----

  let running = null;
  let again = false;
  let timer = null;
  let renderPending = false;
  let lastStart = 0;

  // Für Fokus/Sichtbarkeit: nicht öfter als alle 15 Sekunden nachsehen.
  function auto() {
    if (Date.now() - lastStart > 15000) syncNow();
  }

  function refreshUi() {
    if (renderPending) return;
    if (dialog.open) {
      // Offenen Dialog nicht wegwerfen – nach dem Schließen neu zeichnen.
      renderPending = true;
      dialog.addEventListener('close', () => { renderPending = false; render(); }, { once: true });
      return;
    }
    render();
  }

  async function syncOnce() {
    const cfg = config();
    if (!cfg) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      const base = readJson(BASE_KEY, null);
      const remote = await readRemote(cfg);
      const local = plain(db);
      const merged = plain(mergeDb(local, remote.data || { studios: [], machines: [], sessions: [] }, base?.data));

      const localChanged = applyInPlace(merged);
      takeSnapshot();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch (e) { /* save() meldet das */ }

      let sha = remote.sha;
      if (!remote.data || !same(merged, plain(remote.data))) {
        try {
          sha = await writeRemote(cfg, merged, remote.sha);
        } catch (e) {
          if (e.status === 409 || e.status === 422) continue; // jemand war schneller – neu lesen und mergen
          throw e;
        }
      }
      writeJson(BASE_KEY, { sha, data: merged });
      setState({ lastSyncAt: Date.now(), lastError: null });
      if (localChanged) refreshUi();
      return;
    }
    throw new SyncError('Konflikt beim Speichern – bitte später erneut versuchen', 409);
  }

  // Startet eine Synchronisation (oder hängt sie an eine laufende an).
  function syncNow({ silent = true } = {}) {
    if (!isConfigured()) return Promise.resolve(false);
    if (running) { again = true; return running; }
    clearTimeout(timer);
    lastStart = Date.now();
    updateStatusEl('Synchronisiere…');
    running = (async () => {
      try {
        do {
          again = false;
          await syncOnce();
        } while (again);
        updateStatusEl();
        return true;
      } catch (e) {
        const offline = e.status === 0;
        const prev = state().lastError;
        const msg = offline ? 'Offline – wird später synchronisiert' : e.message;
        setState({ lastError: msg });
        updateStatusEl();
        // Bei automatischen Läufen nur echte Fehler melden, und denselben Fehler nicht ständig wiederholen.
        if (!silent || (!offline && msg !== prev)) toast(`Sync: ${e.message}`);
        return false;
      } finally {
        running = null;
      }
    })();
    return running;
  }

  // Nach jedem Speichern kurz warten (mehrere Sätze hintereinander = ein Commit).
  function schedule() {
    if (!isConfigured()) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(), 2000);
  }

  // ----- Einstellungen -----

  function fmtWhen(ts) {
    if (!ts) return 'noch nie';
    const d = new Date(ts);
    const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? `heute, ${time}` : `${d.toLocaleDateString('de-DE')}, ${time}`;
  }

  function statusText() {
    const s = state();
    if (s.lastError) return `⚠ ${s.lastError} · zuletzt synchronisiert: ${fmtWhen(s.lastSyncAt)}`;
    return `✓ Zuletzt synchronisiert: ${fmtWhen(s.lastSyncAt)}`;
  }

  function updateStatusEl(text) {
    const el = document.getElementById('sync-status');
    if (el) el.textContent = text || statusText();
  }

  function panelHtml() {
    if (isConfigured()) {
      const c = config();
      return `
        <h2>Synchronisation</h2>
        <div class="panel">
          <p style="margin-top:0">Verbunden mit dem GitHub-Repository <b>${esc(c.repo)}</b>.
          Änderungen werden automatisch übertragen, sobald du online bist.</p>
          <p class="muted" id="sync-status" style="font-size:.9rem">${esc(statusText())}</p>
          <div class="row">
            <button class="btn primary" id="sync-now" type="button">Jetzt synchronisieren</button>
            <button class="btn" id="sync-off" type="button">Trennen</button>
          </div>
        </div>`;
    }
    return `
      <h2>Synchronisation</h2>
      <div class="panel">
        <p style="margin-top:0">Gleiche deine Daten zwischen Handy und PC ab – über ein <b>privates GitHub-Repository</b>, kostenlos und ohne weiteren Account.</p>
        <details class="manual" style="margin-top:4px">
          <summary>So richtest du es ein (einmalig)</summary>
          <ol style="padding-left:20px;margin:0">
            <li>Auf <a href="https://github.com/new" target="_blank" rel="noopener" style="color:var(--accent)">github.com/new</a> ein neues Repository anlegen, z. B. <b>gym-daten</b>, Sichtbarkeit <b>Private</b>.</li>
            <li>Auf <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="color:var(--accent)">github.com/settings/personal-access-tokens/new</a> einen Token erstellen:
              Ablaufdatum wählen, bei <i>Repository access</i> „Only select repositories“ → <b>gym-daten</b>,
              bei <i>Permissions</i> → <i>Contents</i> „Read and write“.</li>
            <li>Repository und Token unten eintragen – auf dem Handy und am PC jeweils einmal.</li>
          </ol>
        </details>
        <form id="sync-form" autocomplete="off">
          <label for="sync-repo">Repository (Besitzer/Name)</label>
          <input id="sync-repo" name="repo" required placeholder="z. B. tigraef/gym-daten" autocapitalize="off" spellcheck="false">
          <label for="sync-token">Token</label>
          <input id="sync-token" name="token" type="password" required placeholder="github_pat_…" autocapitalize="off" spellcheck="false">
          <p class="muted" style="font-size:.85rem">Der Token wird nur in diesem Browser gespeichert und nicht mit exportiert.</p>
          <button class="btn primary block" id="sync-connect">Verbinden</button>
        </form>
      </div>`;
  }

  function mountPanel(root) {
    const now = root.querySelector('#sync-now');
    if (now) now.onclick = () => syncNow({ silent: false }).then((ok) => { if (ok) toast('Synchronisiert'); });
    const off = root.querySelector('#sync-off');
    if (off) off.onclick = () => {
      if (!confirm('Synchronisation auf diesem Gerät trennen? Deine Daten bleiben hier und im Repository erhalten.')) return;
      disconnect();
      render();
    };
    const form = root.querySelector('#sync-form');
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const repo = form.repo.value.trim()
        .replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
      const token = form.token.value.trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { toast('Repository bitte als Besitzer/Name angeben'); return; }
      const btn = form.querySelector('#sync-connect');
      btn.disabled = true;
      btn.textContent = 'Prüfe Zugriff…';
      try {
        await connect({ repo, token });
        toast('Verbunden und synchronisiert');
        render();
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
        btn.textContent = 'Verbinden';
      }
    };
  }

  async function connect(cfg) {
    cfg = { ...cfg, path: DEFAULT_PATH };
    const info = await gh(cfg, `/repos/${cfg.repo}`);
    if (!info.private && !confirm(`Das Repository ${cfg.repo} ist öffentlich – jeder könnte deine Trainingsdaten sehen. Trotzdem verwenden?`)) {
      throw new SyncError('Abgebrochen', 0);
    }
    const remote = await readRemote(cfg);
    const counts = (d) => `${d.studios.length} Studios, ${d.machines.length} Geräte, ${d.sessions.length} Trainings`;
    if (remote.data && (db.studios.length || db.machines.length || db.sessions.length)) {
      if (!confirm(`Im Repository liegen bereits Daten (${counts(remote.data)}).\nSie werden mit den Daten in diesem Browser (${counts(db)}) zusammengeführt. Fortfahren?`)) {
        throw new SyncError('Abgebrochen', 0);
      }
    }
    writeJson(CFG_KEY, cfg);
    localStorage.removeItem(BASE_KEY);
    setState({ lastSyncAt: null, lastError: null });
    const ok = await syncNow({ silent: false });
    if (!ok) {
      const msg = state().lastError || 'Synchronisation fehlgeschlagen';
      disconnect();
      throw new SyncError(msg, 0);
    }
  }

  function disconnect() {
    clearTimeout(timer);
    localStorage.removeItem(CFG_KEY);
    localStorage.removeItem(BASE_KEY);
    localStorage.removeItem(STATE_KEY);
  }

  // ----- Start -----

  function init() {
    takeSnapshot();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') auto();
    });
    window.addEventListener('focus', auto);
    window.addEventListener('online', () => syncNow());
    syncNow();
  }

  return { stamp, schedule, syncNow, isConfigured, panelHtml, mountPanel, init, _mergeDb: mergeDb };
})();
