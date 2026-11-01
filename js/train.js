import * as store from './store.js';
import { streakCard, celebrate } from './streak.js';

const FIELDS = ['person', 'action', 'object'];
const LABEL = { person: 'Person', action: 'Action', object: 'Object' };

const MODES = {
  mixed: { name: 'Mixed', desc: 'A mix of the exercises below.' },
  flash: { name: 'Flashcards', desc: 'See a number, recall its P/A/O, then reveal and grade yourself.' },
  reverse: { name: 'Reverse', desc: 'See a person, action or object and type its number.' },
  choice: { name: 'Multiple choice', desc: 'Pick the right answer out of four.' },
  speed: { name: 'Speed drill', desc: '60 seconds of multiple choice. Get as many as you can.' },
};

const SPEED_SECONDS = 60;

const h = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const filled = (n, f) => store.getEntry(n)[f].trim() !== '';
const anyFilled = (n) => FIELDS.some((f) => filled(n, f));

// ---------- Hub ----------

let activeSession = null;

export function renderTrain(view, title, arg) {
  if (arg === 'session' && activeSession) {
    activeSession.start();
    return;
  }
  if (arg === 'session') {
    location.replace('#/train');
    return;
  }
  activeSession = null;
  title.textContent = 'Train';
  const cfg = store.getSetting('train', { mode: 'mixed', field: 'any', length: 20 });
  const pool = store.NUMBERS.filter(anyFilled);
  const now = Date.now();
  const due = pool.filter((n) => store.getStats(n).seen && store.getStats(n).due <= now).length;
  const fresh = pool.filter((n) => !store.getStats(n).seen).length;
  const mastered = pool.filter((n) => store.getStats(n).box >= store.MASTERED_BOX).length;
  const best = store.getRecord('speedBest');
  const weakest = pool
    .filter((n) => store.getStats(n).wrong > 0)
    .sort((a, b) => errorRate(b) - errorRate(a))
    .slice(0, 6);

  if (pool.length < 4) {
    view.innerHTML = `
      <section class="card">
        <h2>Fill in your list first</h2>
        <p>Training needs at least 4 numbers with something filled in. You have ${pool.length}.</p>
        <a class="btn" href="#/pao">Go to PAO list</a>
      </section>`;
    return;
  }

  view.innerHTML = `
    ${streakCard()}
    <section class="stats-row">
      <div><b>${due}</b><span>due</span></div>
      <div><b>${fresh}</b><span>new</span></div>
      <div><b>${mastered}</b><span>mastered</span></div>
      <div><b>${best ?? '–'}</b><span>speed best</span></div>
    </section>

    <form class="card train-setup">
      <h2>Exercise</h2>
      <div class="choices" role="radiogroup">
        ${Object.entries(MODES).map(([k, m]) => `
          <label class="choice">
            <input type="radio" name="mode" value="${k}" ${cfg.mode === k ? 'checked' : ''}>
            <span><b>${m.name}</b><small>${m.desc}</small></span>
          </label>`).join('')}
      </div>

      <h2>Ask about</h2>
      <div class="seg">
        ${['any', ...FIELDS].map((f) => `
          <label><input type="radio" name="field" value="${f}" ${cfg.field === f ? 'checked' : ''}><span>${f === 'any' ? 'All' : LABEL[f]}</span></label>`).join('')}
      </div>

      <div id="length-wrap">
        <h2>Cards per session</h2>
        <div class="seg">
          ${[10, 20, 50].map((n) => `
            <label><input type="radio" name="count" value="${n}" ${cfg.length === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}
        </div>
      </div>

      <button class="btn start" type="submit">Start</button>
      <p class="hint">Numbers you get wrong come back sooner. Numbers you know well are asked less often.</p>
    </form>

    ${weakest.length ? `
    <section class="card">
      <h2>Needs work</h2>
      <ul class="weak">
        ${weakest.map((n) => {
          const s = store.getStats(n);
          return `<li><a href="#/edit/${n}"><span class="num">${n}</span><span>${h(store.getEntry(n).person || '—')}</span><small>${s.wrong} missed / ${s.seen}</small></a></li>`;
        }).join('')}
      </ul>
    </section>` : ''}
  `;

  const form = view.querySelector('form');
  const lengthWrap = view.querySelector('#length-wrap');
  const sync = () => { lengthWrap.hidden = form.elements.mode.value === 'speed'; };
  form.addEventListener('change', sync);
  sync();
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const next = {
      mode: form.elements.mode.value,
      field: form.elements.field.value,
      length: Number(form.elements.count.value),
    };
    store.setSetting('train', next);
    activeSession = new Session(view, title, next);
    location.hash = '#/train/session';
  });
}

function errorRate(n) {
  const s = store.getStats(n);
  return s.seen ? s.wrong / s.seen + s.wrong * 0.01 : 0;
}

// Due numbers first, then new ones, then the ones due soonest.
function selectNumbers(pool, count) {
  const now = Date.now();
  const rank = (n) => {
    const s = store.getStats(n);
    if (s.seen && s.due <= now) return [0, s.due];
    if (!s.seen) return [1, Math.random()];
    return [2, s.due];
  };
  const ranked = shuffle(pool).sort((a, b) => {
    const [ga, ka] = rank(a);
    const [gb, kb] = rank(b);
    return ga - gb || ka - kb;
  });
  return shuffle(ranked.slice(0, count));
}

// ---------- Session ----------

class Session {
  constructor(view, title, cfg) {
    this.view = view;
    this.title = title;
    this.cfg = cfg;
    this.results = [];
    this.retried = new Set();
  }

  fieldFor(n) {
    if (this.cfg.field !== 'any') return this.cfg.field;
    return pick(FIELDS.filter((f) => filled(n, f)));
  }

  pool() {
    return store.NUMBERS.filter((n) => (this.cfg.field === 'any' ? anyFilled(n) : filled(n, this.cfg.field)));
  }

  start() {
    const pool = this.pool();
    if (pool.length < 4) {
      this.view.innerHTML = `<section class="card"><h2>Not enough entries</h2>
        <p>You need at least 4 numbers with a ${LABEL[this.cfg.field] ?? 'value'} filled in.</p>
        <a class="btn" href="#/train">Back</a></section>`;
      return;
    }
    if (this.cfg.mode === 'speed') {
      this.queue = [];
      this.deadline = Date.now() + SPEED_SECONDS * 1000;
      this.timer = setInterval(() => this.tick(), 200);
    } else {
      this.queue = selectNumbers(pool, this.cfg.length);
      this.total = this.queue.length;
    }
    this.next();
  }

  tick() {
    const left = Math.max(0, this.deadline - Date.now());
    const el = this.view.querySelector('.timer');
    if (!document.body.contains(this.view) || location.hash !== '#/train/session') {
      clearInterval(this.timer);
      return;
    }
    if (el) el.textContent = `${Math.ceil(left / 1000)}s`;
    if (left === 0) {
      clearInterval(this.timer);
      this.finish();
    }
  }

  next() {
    if (this.cfg.mode === 'speed') {
      if (Date.now() >= this.deadline) return this.finish();
      const pool = this.pool();
      let n;
      do n = pick(pool); while (pool.length > 1 && n === this.lastNumber);
      this.lastNumber = n;
      return this.askChoice(n);
    }
    const n = this.queue.shift();
    if (n == null) return this.finish();
    const mode = this.cfg.mode === 'mixed' ? pick(['flash', 'reverse', 'choice']) : this.cfg.mode;
    if (mode === 'flash') this.askFlash(n);
    else if (mode === 'reverse') this.askReverse(n);
    else this.askChoice(n);
  }

  header() {
    if (this.cfg.mode === 'speed') {
      const score = this.results.filter((r) => r.correct).length;
      const left = Math.ceil(Math.max(0, this.deadline - Date.now()) / 1000);
      return `<div class="session-bar"><span>Score <b>${score}</b></span><span class="timer">${left}s</span><a href="#/train" class="quit">Quit</a></div>`;
    }
    const done = this.total - this.queue.length - 1;
    return `<div class="session-bar">
      <span>${Math.min(done + 1, this.total)} / ${this.total}</span>
      <div class="progress"><div style="width:${(done / this.total) * 100}%"></div></div>
      <a href="#/train" class="quit">Quit</a>
    </div>`;
  }

  answer(n, correct, startedAt) {
    const ms = Date.now() - startedAt;
    store.recordAnswer(n, correct, ms);
    this.results.push({ n, correct, ms });
    // A missed card comes back once, a few cards later.
    if (!correct && this.cfg.mode !== 'speed' && !this.retried.has(n)) {
      this.retried.add(n);
      this.queue.splice(Math.min(3, this.queue.length), 0, n);
      this.total++;
    }
  }

  // Number shown, recall all three, reveal, self-grade.
  askFlash(n) {
    this.title.textContent = 'Flashcards';
    const e = store.getEntry(n);
    const t0 = Date.now();
    this.view.innerHTML = `${this.header()}
      <button class="flip" type="button" aria-label="Flip card">
        <span class="flip-inner">
          <span class="face front">
            <span class="bignum">${n}</span>
            <span class="prompt">Recall the person, action and object.<br>Tap to flip.</span>
          </span>
          <span class="face back" aria-hidden="true">
            <span class="num">${n}</span>
            <dl class="reveal">
              ${FIELDS.map((f) => `<dt>${LABEL[f]}</dt><dd>${h(e[f] || '—')}</dd>`).join('')}
            </dl>
          </span>
        </span>
      </button>
      <div class="actions">
        <button class="btn big" data-act="show">Show answer</button>
      </div>`;
    const card = this.view.querySelector('.flip');
    const actions = this.view.querySelector('.actions');
    const reveal = () => {
      if (card.classList.contains('flipped')) return;
      card.classList.add('flipped');
      card.querySelector('.back').removeAttribute('aria-hidden');
      card.querySelector('.front').setAttribute('aria-hidden', 'true');
      actions.innerHTML = `
        <button class="btn big warn" data-act="miss">Missed</button>
        <button class="btn big ok" data-act="hit">Got it</button>`;
    };
    card.addEventListener('click', reveal);
    actions.addEventListener('click', (ev) => {
      const act = ev.target.closest('button')?.dataset.act;
      if (act === 'show') {
        reveal();
      } else if (act === 'hit' || act === 'miss') {
        this.answer(n, act === 'hit', t0);
        this.next();
      }
    });
  }

  // One field shown, type the number.
  askReverse(n) {
    this.title.textContent = 'Reverse';
    const f = this.fieldFor(n);
    const t0 = Date.now();
    this.view.innerHTML = `${this.header()}
      <div class="card-q">
        <p class="kind">${LABEL[f]}</p>
        <div class="cue">${h(store.getEntry(n)[f])}</div>
        <form class="type-answer" autocomplete="off">
          <input name="num" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="00" aria-label="Number">
          <button class="btn" type="submit">Check</button>
        </form>
        <p class="feedback" aria-live="polite"></p>
      </div>`;
    const form = this.view.querySelector('form');
    const input = form.elements.num;
    input.focus();
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (form.dataset.done === 'wrong') return this.next();
      if (form.dataset.done) return;
      const val = input.value.trim();
      if (!/^\d{1,2}$/.test(val)) return;
      const correct = val.padStart(2, '0') === n;
      form.dataset.done = correct ? 'right' : 'wrong';
      input.readOnly = true;
      this.answer(n, correct, t0);
      const fb = this.view.querySelector('.feedback');
      if (correct) {
        fb.className = 'feedback ok';
        fb.textContent = 'Correct!';
        setTimeout(() => this.next(), 600);
      } else {
        fb.className = 'feedback bad';
        fb.innerHTML = `It's <b>${n}</b>: ${h(describe(n))}`;
        form.querySelector('button').textContent = 'Next';
        form.querySelector('button').focus();
      }
    });
  }

  // Either number → pick the field value, or field value → pick the number.
  askChoice(n) {
    const speed = this.cfg.mode === 'speed';
    this.title.textContent = speed ? 'Speed drill' : 'Multiple choice';
    const f = this.fieldFor(n);
    const forward = Math.random() < 0.5;
    const others = shuffle(this.pool().filter((m) => m !== n && filled(m, f)));
    const seen = new Set([store.getEntry(n)[f].trim().toLowerCase()]);
    const distractors = [];
    for (const m of others) {
      const key = forward ? store.getEntry(m)[f].trim().toLowerCase() : m;
      if (forward && seen.has(key)) continue;
      seen.add(key);
      distractors.push(m);
      if (distractors.length === 3) break;
    }
    const options = shuffle([n, ...distractors]);
    const label = (m) => (forward ? h(store.getEntry(m)[f]) : m);
    const t0 = Date.now();
    this.view.innerHTML = `${this.header()}
      <div class="card-q">
        ${forward
          ? `<p class="kind">Which ${LABEL[f].toLowerCase()}?</p><div class="bignum">${n}</div>`
          : `<p class="kind">${LABEL[f]}</p><div class="cue">${h(store.getEntry(n)[f])}</div>`}
      </div>
      <div class="options ${forward ? '' : 'nums'}">
        ${options.map((m) => `<button class="opt" data-n="${m}">${label(m)}</button>`).join('')}
      </div>
      <p class="feedback" aria-live="polite"></p>`;
    const box = this.view.querySelector('.options');
    box.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.opt');
      if (!btn || box.dataset.done) return;
      box.dataset.done = '1';
      const correct = btn.dataset.n === n;
      this.answer(n, correct, t0);
      box.querySelector(`[data-n="${n}"]`).classList.add('right');
      if (!correct) btn.classList.add('wrong');
      if (speed) {
        setTimeout(() => this.next(), correct ? 150 : 700);
        return;
      }
      if (correct) {
        setTimeout(() => this.next(), 500);
      } else {
        const fb = this.view.querySelector('.feedback');
        fb.className = 'feedback bad';
        fb.innerHTML = `<b>${n}</b>: ${h(describe(n))}`;
        const nextBtn = Object.assign(document.createElement('button'), { className: 'btn', textContent: 'Next' });
        nextBtn.addEventListener('click', () => this.next());
        fb.after(nextBtn);
      }
    });
  }

  finish() {
    clearInterval(this.timer);
    this.title.textContent = 'Results';
    const right = this.results.filter((r) => r.correct).length;
    const total = this.results.length;
    const avg = total ? (this.results.reduce((s, r) => s + r.ms, 0) / total / 1000).toFixed(1) : '–';
    const missed = [...new Set(this.results.filter((r) => !r.correct).map((r) => r.n))];
    let recordLine = '';
    if (this.cfg.mode === 'speed') {
      const best = store.getRecord('speedBest') ?? 0;
      if (right > best) {
        store.setRecord('speedBest', right);
        recordLine = `<p class="record">New personal best!</p>`;
      } else {
        recordLine = `<p class="hint">Personal best: ${best}</p>`;
      }
    }
    const streakLine = total ? celebrate(store.logActivity()) : '';
    this.view.innerHTML = `
      <section class="card results">
        <div class="bignum">${right}<small>/${total}</small></div>
        ${recordLine}
        ${streakLine}
        <p>Average answer time: <b>${avg}s</b></p>
      </section>
      ${missed.length ? `
      <section class="card">
        <h2>Missed</h2>
        <ul class="weak">
          ${missed.map((n) => `<li><a href="#/edit/${n}"><span class="num">${n}</span><span>${h(describe(n))}</span></a></li>`).join('')}
        </ul>
      </section>` : ''}
      <div class="actions">
        <a class="btn big ghost" href="#/train">Done</a>
        <button class="btn big" id="again">Go again</button>
      </div>`;
    this.view.querySelector('#again').addEventListener('click', () => {
      activeSession = new Session(this.view, this.title, this.cfg);
      activeSession.start();
    });
  }
}

function describe(n) {
  const e = store.getEntry(n);
  return FIELDS.map((f) => e[f]).filter(Boolean).join(' · ');
}
