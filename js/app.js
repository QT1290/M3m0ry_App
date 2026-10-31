import * as store from './store.js';
import { renderTrain } from './train.js';

const view = document.getElementById('view');
const title = document.getElementById('title');

const h = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const routes = {
  pao: renderList,
  edit: renderEdit,
  train: (arg) => renderTrain(view, title, arg),
  data: renderData,
};

let listFilter = { query: '', onlyMissing: false };

function route() {
  const [name = 'pao', arg] = location.hash.replace(/^#\/?/, '').split('/');
  const render = routes[name] ?? renderList;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === (name === 'edit' ? 'pao' : name));
  });
  render(arg);
  if (!view.contains(document.activeElement)) view.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------- PAO list ----------

function renderList() {
  title.textContent = 'PAO list';
  const done = store.completeCount();
  view.innerHTML = `
    <section class="summary">
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${done}">
        <div style="width:${done}%"></div>
      </div>
      <p>${done} of 100 numbers complete</p>
    </section>
    <div class="filters">
      <input type="search" id="q" placeholder="Search number, person, action, object" value="${h(listFilter.query)}" autocomplete="off">
      <label class="toggle"><input type="checkbox" id="missing" ${listFilter.onlyMissing ? 'checked' : ''}> Incomplete only</label>
    </div>
    <ul class="pao-list" id="list"></ul>
  `;
  const list = view.querySelector('#list');
  const draw = () => {
    const q = listFilter.query.trim().toLowerCase();
    const rows = store.NUMBERS.filter((n) => {
      if (listFilter.onlyMissing && store.isComplete(n)) return false;
      if (!q) return true;
      const e = store.getEntry(n);
      return [n, e.person, e.action, e.object].some((s) => s.toLowerCase().includes(q));
    });
    list.innerHTML = rows.length ? rows.map((n) => {
      const e = store.getEntry(n);
      const cell = (v) => v ? h(v) : '<span class="empty">—</span>';
      return `<li><a href="#/edit/${n}" class="${store.isComplete(n) ? '' : 'incomplete'}">
        <span class="num">${n}</span>
        <span class="pao">
          <span><b>P</b>${cell(e.person)}</span>
          <span><b>A</b>${cell(e.action)}</span>
          <span><b>O</b>${cell(e.object)}</span>
        </span>
      </a></li>`;
    }).join('') : '<li class="none">No matches.</li>';
  };
  view.querySelector('#q').addEventListener('input', (ev) => { listFilter.query = ev.target.value; draw(); });
  view.querySelector('#missing').addEventListener('change', (ev) => { listFilter.onlyMissing = ev.target.checked; draw(); });
  draw();
}

// ---------- Edit one number ----------

function renderEdit(arg) {
  const n = store.NUMBERS.includes(arg) ? arg : '00';
  const idx = Number(n);
  const prev = store.NUMBERS[(idx + 99) % 100];
  const next = store.NUMBERS[(idx + 1) % 100];
  const e = store.getEntry(n);
  title.textContent = `Edit ${n}`;
  view.innerHTML = `
    <form class="edit" autocomplete="off">
      <div class="bignum">${n}</div>
      <label>Person<input name="person" value="${h(e.person)}" enterkeyhint="next"></label>
      <label>Action<input name="action" value="${h(e.action)}" enterkeyhint="next"></label>
      <label>Object<input name="object" value="${h(e.object)}" enterkeyhint="done"></label>
      <p class="status" id="status" aria-live="polite">Changes save automatically.</p>
      <div class="pager">
        <a class="btn" href="#/edit/${prev}">‹ ${prev}</a>
        <a class="btn ghost" href="#/pao">List</a>
        <a class="btn" href="#/edit/${next}">${next} ›</a>
      </div>
    </form>
  `;
  const form = view.querySelector('form');
  const status = view.querySelector('#status');
  form.addEventListener('input', () => {
    const ok = store.setEntry(n, {
      person: form.elements.person.value,
      action: form.elements.action.value,
      object: form.elements.object.value,
    });
    status.textContent = ok ? 'Saved.' : 'Could not save. Storage may be full or blocked.';
  });
  // Enter moves to the next field, and from the last field to the next number.
  const fields = [form.elements.person, form.elements.action, form.elements.object];
  form.addEventListener('submit', (ev) => ev.preventDefault());
  fields.forEach((f, i) => f.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    if (i < 2) fields[i + 1].focus();
    else location.hash = `#/edit/${next}`;
  }));
  if (!e.person) form.elements.person.focus();
}

// ---------- Backup / import ----------

function renderData() {
  title.textContent = 'Backup';
  view.innerHTML = `
    <section class="card">
      <h2>Back up your data</h2>
      <p>Your list is stored only on this device. Download a backup now and then, and use it to move your list to another phone or computer.</p>
      <div class="row">
        <button class="btn" id="exp-json">Download backup (.json)</button>
        <button class="btn ghost" id="exp-csv">Download as spreadsheet (.csv)</button>
      </div>
    </section>
    <section class="card">
      <h2>Restore or import</h2>
      <p>A <b>.json</b> backup replaces everything. A <b>.csv</b> file with columns <code>number, person, action, object</code> fills in those numbers and leaves the rest alone.</p>
      <label class="btn file">Choose file…<input type="file" id="imp" accept=".json,.csv,.txt,application/json,text/csv"></label>
      <p class="status" id="imp-status" aria-live="polite"></p>
    </section>
    <section class="card">
      <h2>Reset training progress</h2>
      <p>Forget all training history and personal bests, but keep your PAO list.</p>
      <button class="btn ghost" id="reset-stats">Reset progress</button>
    </section>
    <section class="card danger">
      <h2>Start over</h2>
      <p>Erase every entry on this device.</p>
      <button class="btn warn" id="reset">Erase all data</button>
    </section>
  `;
  view.querySelector('#exp-json').addEventListener('click', () =>
    download(`pao-backup-${today()}.json`, store.exportJSON(), 'application/json'));
  view.querySelector('#exp-csv').addEventListener('click', () =>
    download(`pao-list-${today()}.csv`, store.exportCSV(), 'text/csv'));

  const status = view.querySelector('#imp-status');
  view.querySelector('#imp').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        store.importJSON(text);
        status.textContent = 'Backup restored.';
      } else {
        const count = store.importCSV(text);
        status.textContent = `Imported ${count} numbers.`;
      }
    } catch (err) {
      status.textContent = `Import failed: ${err.message}`;
    }
    ev.target.value = '';
  });

  armButton(view.querySelector('#reset-stats'), () => store.resetStats(), 'Progress reset');
  armButton(view.querySelector('#reset'), () => store.resetAll(), 'Erased');
}

// Destructive buttons need a second tap to confirm.
function armButton(btn, action, doneText) {
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) {
      action();
      btn.textContent = doneText;
      delete btn.dataset.armed;
    } else {
      btn.dataset.armed = '1';
      btn.textContent = 'Tap again to confirm';
    }
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
