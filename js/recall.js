import * as store from './store.js';

const LENGTHS = [12, 24, 36, 48, 60, 80, 100];
const TIMES = [0, 60, 120, 300]; // seconds to memorize, 0 = untimed
const GROUP = 6; // one PAO image = 3 pairs

const h = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtTime = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function randomDigits(n) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => String(b % 10)).join('');
}

function chunks(str, size) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

// Digits in rows of six, with a gap between each pair.
function digitRows(digits, render = (c) => h(c.d)) {
  return chunks([...digits].map((d, i) => ({ d, i })), GROUP).map((row) => `
    <div class="drow">${chunks(row, 2).map((pair) => `
      <span class="pair">${pair.map(render).join('')}</span>`).join('')}
    </div>`).join('');
}

let active = null;

export function renderRecall(view, title, arg) {
  if (arg === 'go' && active) {
    active.memorize();
    return;
  }
  if (arg === 'go') {
    location.replace('#/recall');
    return;
  }
  if (active) active.stop();
  active = null;
  renderSetup(view, title);
}

// ---------- Setup + history ----------

function renderSetup(view, title) {
  title.textContent = 'Recall test';
  const cfg = store.getSetting('recall', { length: 24, time: 0, hints: false, oneAtATime: false });
  const history = store.getRecallHistory();
  const perfect = history.filter((r) => r.correct === r.digits);
  const bestPerfect = perfect.length ? Math.max(...perfect.map((r) => r.digits)) : null;
  const bestRun = history.length ? Math.max(...history.map((r) => r.firstError)) : null;
  const custom = !LENGTHS.includes(cfg.length);

  view.innerHTML = `
    <section class="stats-row three">
      <div><b>${bestPerfect ?? '–'}</b><span>longest perfect</span></div>
      <div><b>${bestRun ?? '–'}</b><span>best run</span></div>
      <div><b>${history.length}</b><span>tests done</span></div>
    </section>

    <form class="card train-setup" autocomplete="off">
      <h2>How many digits?</h2>
      <div class="chips">
        ${LENGTHS.map((n) => `
          <label><input type="radio" name="len" value="${n}" ${cfg.length === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}
        <label><input type="radio" name="len" value="custom" ${custom ? 'checked' : ''}><span>Other</span></label>
      </div>
      <input class="custom-len" name="customLen" type="number" inputmode="numeric" min="2" max="400"
        value="${custom ? cfg.length : ''}" placeholder="Number of digits" ${custom ? '' : 'hidden'}>

      <h2>Memorize time</h2>
      <div class="seg">
        ${TIMES.map((t) => `
          <label><input type="radio" name="time" value="${t}" ${cfg.time === t ? 'checked' : ''}><span>${t ? `${t / 60} min` : 'No limit'}</span></label>`).join('')}
      </div>

      <h2>Options</h2>
      <label class="toggle"><input type="checkbox" name="oneAtATime" ${cfg.oneAtATime ? 'checked' : ''}> Show one image (6 digits) at a time</label>
      <label class="toggle"><input type="checkbox" name="hints" ${cfg.hints ? 'checked' : ''}> Practice mode: show the PAO under each group</label>

      <button class="btn start" type="submit">Start</button>
      <p class="hint">Memorize the digits, then type them back in order. Each row of six digits is one person–action–object image.</p>
    </form>

    ${history.length ? `
    <section class="card">
      <h2>Recent results</h2>
      <ul class="history">
        ${history.slice(-10).reverse().map((r) => `
          <li>
            <span class="score ${r.correct === r.digits ? 'perfect' : ''}">${r.correct}/${r.digits}</span>
            <span>${r.firstError === r.digits ? 'all correct' : `first ${r.firstError} in a row`}</span>
            <small>${fmtTime(r.memMs)}${r.hints ? ' · practice' : ''} · ${new Date(r.at).toLocaleDateString()}</small>
          </li>`).join('')}
      </ul>
    </section>` : ''}
  `;

  const form = view.querySelector('form');
  const customInput = form.elements.customLen;
  form.addEventListener('change', () => {
    customInput.hidden = form.elements.len.value !== 'custom';
    if (!customInput.hidden && document.activeElement !== customInput) customInput.focus();
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    let length = form.elements.len.value === 'custom'
      ? Number(customInput.value)
      : Number(form.elements.len.value);
    if (!Number.isFinite(length) || length < 2) {
      customInput.focus();
      return;
    }
    length = Math.min(400, Math.round(length));
    const next = {
      length,
      time: Number(form.elements.time.value),
      hints: form.elements.hints.checked,
      oneAtATime: form.elements.oneAtATime.checked,
    };
    store.setSetting('recall', next);
    active = new Test(view, title, next);
    location.hash = '#/recall/go';
  });
}

// ---------- One test ----------

class Test {
  constructor(view, title, cfg) {
    this.view = view;
    this.title = title;
    this.cfg = cfg;
    this.digits = randomDigits(cfg.length);
  }

  stop() {
    clearInterval(this.timer);
  }

  stillHere() {
    return location.hash === '#/recall/go' && this.view.isConnected;
  }

  memorize() {
    this.title.textContent = 'Memorize';
    this.started = Date.now();
    this.group = 0;
    const groups = chunks(this.digits, GROUP);
    const limit = this.cfg.time * 1000;

    const hintFor = (g) => {
      // Pair 1 gives the person, pair 2 the action, pair 3 the object.
      const fields = ['person', 'action', 'object'];
      return chunks(g, 2)
        .map((p, i) => h((p.length === 2 && store.getEntry(p)[fields[i]]) || p))
        .join(' · ');
    };

    this.view.innerHTML = `
      <div class="session-bar">
        <span>${this.digits.length} digits</span>
        <span class="timer" id="clock">${limit ? fmtTime(limit) : '0:00'}</span>
        <a href="#/recall" class="quit">Quit</a>
      </div>
      <div class="digits" id="digits"></div>
      <div class="actions">
        ${this.cfg.oneAtATime ? '<button class="btn big ghost" id="prev">‹ Back</button><button class="btn big ghost" id="next">Next ›</button>' : ''}
      </div>
      <button class="btn big done-btn" id="done">I'm ready to recall</button>
    `;

    const box = this.view.querySelector('#digits');
    const draw = () => {
      if (this.cfg.oneAtATime) {
        const g = groups[this.group];
        box.innerHTML = `
          <p class="kind">Group ${this.group + 1} of ${groups.length}</p>
          <div class="single">${digitRows(g)}</div>
          ${this.cfg.hints ? `<p class="phint">${hintFor(g)}</p>` : ''}`;
        this.view.querySelector('#prev').disabled = this.group === 0;
        this.view.querySelector('#next').disabled = this.group === groups.length - 1;
      } else {
        box.innerHTML = groups.map((g) => `
          <div class="dgroup">${digitRows(g)}${this.cfg.hints ? `<p class="phint">${hintFor(g)}</p>` : ''}</div>`).join('');
      }
    };
    draw();
    if (this.cfg.oneAtATime) {
      this.view.querySelector('#prev').addEventListener('click', () => { this.group--; draw(); });
      this.view.querySelector('#next').addEventListener('click', () => { this.group++; draw(); });
    }

    const clock = this.view.querySelector('#clock');
    this.timer = setInterval(() => {
      if (!this.stillHere()) return this.stop();
      const elapsed = Date.now() - this.started;
      if (limit) {
        clock.textContent = fmtTime(limit - elapsed);
        clock.classList.toggle('low', limit - elapsed < 10_000);
        if (elapsed >= limit) this.recall();
      } else {
        clock.textContent = fmtTime(elapsed);
      }
    }, 250);
    this.view.querySelector('#done').addEventListener('click', () => this.recall());
  }

  recall() {
    this.stop();
    this.memMs = Math.min(Date.now() - this.started, this.cfg.time ? this.cfg.time * 1000 : Infinity);
    this.title.textContent = 'Recall';
    this.recallStart = Date.now();
    const n = this.digits.length;
    this.view.innerHTML = `
      <div class="session-bar">
        <span id="count">0 / ${n}</span>
        <span class="timer" id="clock">0:00</span>
        <a href="#/recall" class="quit">Quit</a>
      </div>
      <div class="digits recall-grid" id="grid">${digitRows(' '.repeat(n), (c) => `<span class="cell" data-i="${c.i}"></span>`)}</div>
      <input id="entry" class="entry" inputmode="numeric" autocomplete="off" aria-label="Type the digits">
      <div class="actions">
        <button class="btn big ghost" id="back">⌫ Delete</button>
        <button class="btn big" id="submit">Check</button>
      </div>
    `;
    const entry = this.view.querySelector('#entry');
    const cells = [...this.view.querySelectorAll('.cell')];
    const count = this.view.querySelector('#count');
    const draw = () => {
      const val = entry.value;
      cells.forEach((c, i) => {
        c.textContent = val[i] ?? '';
        c.classList.toggle('cursor', i === val.length);
      });
      count.textContent = `${val.length} / ${n}`;
      cells[Math.min(val.length, n - 1)]?.scrollIntoView({ block: 'nearest' });
    };
    entry.addEventListener('input', () => {
      entry.value = entry.value.replace(/\D/g, '').slice(0, n);
      draw();
    });
    this.view.querySelector('#grid').addEventListener('click', () => entry.focus());
    this.view.querySelector('#back').addEventListener('click', () => {
      entry.value = entry.value.slice(0, -1);
      draw();
      entry.focus();
    });
    this.view.querySelector('#submit').addEventListener('click', () => this.finish(entry.value));
    entry.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') this.finish(entry.value); });
    draw();
    entry.focus();

    const clock = this.view.querySelector('#clock');
    this.timer = setInterval(() => {
      if (!this.stillHere()) return this.stop();
      clock.textContent = fmtTime(Date.now() - this.recallStart);
    }, 250);
  }

  finish(answer) {
    this.stop();
    const n = this.digits.length;
    let correct = 0;
    let firstError = n;
    for (let i = 0; i < n; i++) {
      if (answer[i] === this.digits[i]) correct++;
      else if (firstError === n) firstError = i;
    }
    const result = {
      at: Date.now(),
      digits: n,
      correct,
      firstError,
      memMs: this.memMs,
      recallMs: Date.now() - this.recallStart,
      hints: this.cfg.hints,
    };
    store.addRecallResult(result);

    this.title.textContent = 'Result';
    this.view.innerHTML = `
      <section class="card results">
        <div class="bignum">${correct}<small>/${n}</small></div>
        <p>${firstError === n ? '<b class="record">Perfect!</b>' : `First <b>${firstError}</b> digits in a row correct`}</p>
        <p>Memorized in <b>${fmtTime(result.memMs)}</b> · recalled in <b>${fmtTime(result.recallMs)}</b></p>
      </section>
      <section class="card">
        <h2>Your answer</h2>
        <p class="hint">Wrong digits are red, with the right digit underneath.</p>
        <div class="digits check">${digitRows(this.digits, (c) => {
          const got = answer[c.i];
          if (got === c.d) return `<span class="cell ok">${c.d}</span>`;
          return `<span class="cell bad">${got ?? '·'}<small>${c.d}</small></span>`;
        })}</div>
      </section>
      <div class="actions">
        <a class="btn big ghost" href="#/recall">Done</a>
        <button class="btn big" id="again">Try again</button>
      </div>
    `;
    this.view.querySelector('#again').addEventListener('click', () => {
      active = new Test(this.view, this.title, this.cfg);
      active.memorize();
    });
  }
}
