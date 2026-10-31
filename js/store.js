// All app data lives in the browser's localStorage on this device.
// Use the Backup tab to export/import it as a file.

const KEY = 'pao-memory-v1';

export const NUMBERS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));

function emptyData() {
  const pao = {};
  for (const n of NUMBERS) pao[n] = { person: '', action: '', object: '' };
  return { version: 1, pao, stats: {}, records: {}, settings: {}, palaces: [] };
}

function normalize(raw) {
  const data = emptyData();
  if (!raw || typeof raw !== 'object') return data;
  for (const n of NUMBERS) {
    const e = raw.pao?.[n];
    if (e) {
      data.pao[n] = {
        person: String(e.person ?? ''),
        action: String(e.action ?? ''),
        object: String(e.object ?? ''),
      };
    }
  }
  for (const key of ['stats', 'records', 'settings']) {
    if (raw[key] && typeof raw[key] === 'object') data[key] = raw[key];
  }
  if (Array.isArray(raw.palaces)) data.palaces = raw.palaces;
  return data;
}

let data = load();

function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return emptyData();
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function getEntry(n) {
  return data.pao[n];
}

export function setEntry(n, entry) {
  data.pao[n] = { ...data.pao[n], ...entry };
  return save();
}

export function isComplete(n) {
  const e = data.pao[n];
  return Boolean(e.person.trim() && e.action.trim() && e.object.trim());
}

export function completeCount() {
  return NUMBERS.filter(isComplete).length;
}

export function exportJSON() {
  return JSON.stringify(data, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.pao) {
    throw new Error('This file is not a PAO Memory backup.');
  }
  data = normalize(parsed);
  save();
}

// CSV with columns: number, person, action, object (header row optional).
export function importCSV(text) {
  let count = 0;
  for (const row of parseCSV(text)) {
    const [num, person = '', action = '', object = ''] = row.map((c) => c.trim());
    if (!/^\d{1,2}$/.test(num)) continue; // skips header and blank rows
    data.pao[num.padStart(2, '0')] = { person, action, object };
    count++;
  }
  if (count === 0) throw new Error('No rows found. Expected columns: number, person, action, object.');
  save();
  return count;
}

export function exportCSV() {
  const esc = (s) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ['number,person,action,object'];
  for (const n of NUMBERS) {
    const e = data.pao[n];
    lines.push([n, e.person, e.action, e.object].map(esc).join(','));
  }
  return lines.join('\n');
}

// Accepts comma, semicolon (Dutch Excel) or tab separators, and quoted fields.
function parseCSV(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = [';', '\t', ','].find((s) => firstLine.includes(s)) ?? ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------- Training stats (spaced repetition) ----------

// Minutes until a number is due again, by box. A miss sends it back to box 0.
const INTERVALS = [0, 10, 60, 24 * 60, 3 * 24 * 60, 7 * 24 * 60, 21 * 24 * 60];
export const MASTERED_BOX = 4;

export function getStats(n) {
  return data.stats[n] ?? { box: 0, due: 0, seen: 0, correct: 0, wrong: 0 };
}

export function recordAnswer(n, correct, ms) {
  const s = { ...getStats(n) };
  s.seen++;
  if (correct) {
    s.correct++;
    s.box = Math.min(s.box + 1, INTERVALS.length - 1);
  } else {
    s.wrong++;
    s.box = 0;
  }
  s.due = Date.now() + INTERVALS[s.box] * 60_000;
  if (ms != null) s.avgMs = s.avgMs ? Math.round(s.avgMs * 0.7 + ms * 0.3) : ms;
  data.stats[n] = s;
  save();
}

export function getRecord(key) {
  return data.records[key];
}

export function setRecord(key, value) {
  data.records[key] = value;
  save();
}

export function getSetting(key, fallback) {
  return data.settings[key] ?? fallback;
}

export function setSetting(key, value) {
  data.settings[key] = value;
  save();
}

export function resetStats() {
  data.stats = {};
  data.records = {};
  save();
}

export function resetAll() {
  data = emptyData();
  save();
}
