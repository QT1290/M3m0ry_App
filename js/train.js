import * as store from './store.js';
import { streakCard, celebrate } from './streak.js';
import { Chain } from './chain.js';

const FIELDS = ['person', 'action', 'object'];
const LABEL = { person: 'Person', action: 'Action', object: 'Object' };

const MODES = {
  mixed: { name: 'Mixed', desc: 'Reverse and multiple choice mixed together.' },
  reverse: { name: 'Reverse', desc: 'See a person, action or object and type its number.' },
  choice: { name: 'Multiple choice', desc: 'Pick the right answer out of four.' },
  speed: { name: 'Speed drill', desc: '60 seconds of multiple choice. Get as many as you can.' },
  decode: { name: 'Decode', desc: 'See a person, action and object and type the 6 digits they stand for.' },
  encode: { name: 'Encode', desc: 'See 6 digits and pick the person, action and object as fast as you can.' },
  slow: { name: 'Slow numbers', desc: 'Drill the numbers you take longest to answer.' },
  chain: { name: 'Chain', desc: 'Each line repeats the chain so far plus one new item. Miss an item you had right before and the game ends.' },
};

// Modes with no fixed number of cards.
const OPEN_ENDED = ['speed', 'chain'];
// Modes that always use all three of person, action and object.
const TRIPLE = ['decode', 'encode'];
const BEST = { speed: 'speedBest', chain: 'chainBest' };

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
  if (!MODES[cfg.mode]) cfg.mode = 'mixed';
  const pool = store.NUMBERS.filter(anyFilled);
  const now = Date.now();
  const due = pool.filter((n) => store.getStats(n).seen && store.getStats(n).due <= now).length;
  const fresh = pool.filter((n) => !store.getStats(n).seen).length;
  const mastered = pool.filter((n) => store.getStats(n).box >= store.MASTERED_BOX).length;
  const weakest = pool
    .filter((n) => store.getStats(n).wrong > 0)
    .sort((a, b) => errorRate(b) - errorRate(a))
    .slice(0, 6);
  const slowest = bySlowness(pool).slice(0, 6);

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
      <div><b>${store.getRecord('chainBest') ?? '–'}</b><span>chain best</span></div>
    </section>

    <form class="card train-setup">
      <h2>Exercise</h2>
      <div class="choices" role="radiogroup">
        ${Object.entries(MODES).map(([k, m]) => `
          <label class="choice">
            <input type="radio" name="mode" value="${k}" ${cfg.mode === k ? 'checked' : ''}>
            <span><b>${m.name}${BEST[k] && store.getRecord(BEST[k]) != null ? ` <em class="best">Best ${store.getRecord(BEST[k])}</em>` : ''}</b><small>${m.desc}</small></span>
          </label>`).join('')}
      </div>

      <div id="field-wrap">
      <h2>Ask about</h2>
      <div class="seg">
        ${['any', ...FIELDS].map((f) => `
          <label><input type="radio" name="field" value="${f}" ${cfg.field === f ? 'checked' : ''}><span>${f === 'any' ? 'All' : LABEL[f]}</span></label>`).join('')}
      </div>
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

    ${slowest.length ? `
    <section class="card">
      <h2>Slowest numbers</h2>
      <ul class="weak">
        ${slowest.map((n) => `<li><a href="#/edit/${n}"><span class="num">${n}</span><span>${h(store.getEntry(n).person || '—')}</span><small>${(store.getStats(n).avgMs / 1000).toFixed(1)}s avg</small></a></li>`).join('')}
      </ul>
    </section>` : ''}

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
  const fieldWrap = view.querySelector('#field-wrap');
  const sync = () => {
    lengthWrap.hidden = OPEN_ENDED.includes(form.elements.mode.value);
    fieldWrap.hidden = TRIPLE.includes(form.elements.mode.value);
  };
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
    activeSession = next.mode === 'chain' ? new Chain(view, title, next) : new Session(view, title, next);
    location.hash = '#/train/session';
  });
}

function errorRate(n) {
  const s = store.getStats(n);
  return s.seen ? s.wrong / s.seen + s.wrong * 0.01 : 0;
}

// Answered numbers, slowest average answer time first.
function bySlowness(pool) {
  return pool.filter((n) => store.getStats(n).avgMs).sort((a, b) => store.getStats(b).avgMs - store.getStats(a).avgMs);
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
    this.missedPairs = new Set();
  }

  fieldFor(n) {
    if (this.cfg.field !== 'any') return this.cfg.field;
    return pick(FIELDS.filter((f) => filled(n, f)));
  }

  pool() {
    return store.NUMBERS.filter((n) => (this.cfg.field === 'any' ? anyFilled(n) : filled(n, this.cfg.field)));
  }

  fieldPool(f) {
    return store.NUMBERS.filter((n) => filled(n, f));
  }

  // Six-digit cards for Decode/Encode: the person comes from the first pair,
  // the action from the second and the object from the third.
  makeTriples(count) {
    const [ps, as, os] = FIELDS.map((f) => selectNumbers(this.fieldPool(f), count));
    return Array.from({ length: count }, (_, i) => [ps[i % ps.length], as[i % as.length], os[i % os.length]]);
  }

  start() {
    if (TRIPLE.includes(this.cfg.mode)) {
      const short = FIELDS.filter((f) => this.fieldPool(f).length < 4);
      if (short.length) {
        this.view.innerHTML = `<section class="card"><h2>Not enough entries</h2>
          <p>${MODES[this.cfg.mode].name} needs at least 4 numbers with a ${short.map((f) => LABEL[f].toLowerCase()).join(', ')} filled in.</p>
          <a class="btn" href="#/train">Back</a></section>`;
        return;
      }
      this.queue = this.makeTriples(this.cfg.length);
      this.total = this.queue.length;
      return this.next();
    }
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
    } else if (this.cfg.mode === 'slow') {
      // Slowest first; top up with unanswered numbers if there aren't enough yet.
      const slow = bySlowness(pool).slice(0, this.cfg.length);
      const rest = selectNumbers(pool.filter((n) => !slow.includes(n)), this.cfg.length - slow.length);
      this.queue = shuffle([...slow, ...rest]);
      this.total = this.queue.length;
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
    const mode = ['mixed', 'slow'].includes(this.cfg.mode) ? pick(['reverse', 'choice']) : this.cfg.mode;
    if (mode === 'decode') this.askDecode(n);
    else if (mode === 'encode') this.askEncode(n);
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

  // Records a six-digit card: each pair counts for spaced repetition on its own.
  answerTriple(triple, rights, startedAt) {
    const ms = Date.now() - startedAt;
    triple.forEach((n, i) => {
      store.recordAnswer(n, rights[i], ms / 3);
      if (!rights[i]) this.missedPairs.add(n);
    });
    this.results.push({ n: triple, correct: rights.every(Boolean), ms });
  }

  tripleCue(triple) {
    return FIELDS.map((f, i) => `
      <div class="triple-row"><span class="kind">${LABEL[f]}</span><b>${h(store.getEntry(triple[i])[f])}</b></div>`).join('');
  }

  // Person + action + object shown, type the six digits.
  askDecode(triple) {
    this.title.textContent = 'Decode';
    const t0 = Date.now();
    this.view.innerHTML = `${this.header()}
      <div class="card-q">
        <div class="triple">${this.tripleCue(triple)}</div>
        <form class="type-answer" autocomplete="off">
          <input name="num" class="six" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="000000" aria-label="Six digits">
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
      const val = input.value.replace(/\D/g, '');
      if (val.length !== 6) return;
      const given = [val.slice(0, 2), val.slice(2, 4), val.slice(4, 6)];
      const rights = triple.map((n, i) => given[i] === n);
      const correct = rights.every(Boolean);
      form.dataset.done = correct ? 'right' : 'wrong';
      input.readOnly = true;
      this.answerTriple(triple, rights, t0);
      const fb = this.view.querySelector('.feedback');
      if (correct) {
        fb.className = 'feedback ok';
        fb.textContent = 'Correct!';
        setTimeout(() => this.next(), 700);
      } else {
        fb.className = 'feedback bad';
        fb.innerHTML = `It's <b>${triple.join(' ')}</b><br>` + triple.map((n, i) => (rights[i]
          ? `<span class="pair-ok">${n} ✓</span>`
          : `<span>${given[i]} → <b>${n}</b> ${h(store.getEntry(n)[FIELDS[i]])}</span>`)).join(' · ');
        form.querySelector('button').textContent = 'Next';
        form.querySelector('button').focus();
      }
    });
  }

  // Six digits shown, pick the person, then the action, then the object.
  askEncode(triple) {
    this.title.textContent = 'Encode';
    const t0 = Date.now();
    const rights = [];
    this.view.innerHTML = `${this.header()}
      <div class="card-q">
        <div class="drow six-digits">${triple.map((n, i) => `<span class="pair" data-i="${i}">${n}</span>`).join('')}</div>
        <p class="kind" id="step"></p>
      </div>
      <div class="options" id="opts"></div>
      <p class="feedback" aria-live="polite"></p>`;
    const box = this.view.querySelector('#opts');
    const stepEl = this.view.querySelector('#step');
    const fb = this.view.querySelector('.feedback');
    const pairs = [...this.view.querySelectorAll('.six-digits .pair')];

    const done = () => {
      this.answerTriple(triple, rights, t0);
      box.innerHTML = '';
      pairs.forEach((el) => el.classList.remove('now'));
      stepEl.textContent = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
      if (rights.every(Boolean)) {
        fb.className = 'feedback ok';
        fb.textContent = 'All three right!';
        setTimeout(() => this.next(), 700);
        return;
      }
      fb.className = 'feedback bad';
      fb.innerHTML = triple.map((n, i) => `<b>${n}</b> ${h(store.getEntry(n)[FIELDS[i]])}`).join(' · ');
      const nextBtn = Object.assign(document.createElement('button'), { className: 'btn', textContent: 'Next' });
      nextBtn.addEventListener('click', () => this.next());
      fb.after(nextBtn);
    };

    const step = (i) => {
      if (i === 3) return done();
      const f = FIELDS[i];
      const n = triple[i];
      pairs.forEach((el, j) => el.classList.toggle('now', j === i));
      stepEl.textContent = `${LABEL[f]} for ${n}?`;
      const seen = new Set([store.getEntry(n)[f].trim().toLowerCase()]);
      const distractors = [];
      for (const m of shuffle(this.fieldPool(f))) {
        const key = store.getEntry(m)[f].trim().toLowerCase();
        if (m === n || seen.has(key)) continue;
        seen.add(key);
        distractors.push(m);
        if (distractors.length === 3) break;
      }
      box.innerHTML = shuffle([n, ...distractors])
        .map((m) => `<button class="opt" data-n="${m}">${h(store.getEntry(m)[f])}</button>`).join('');
      let locked = false;
      box.onclick = (ev) => {
        const btn = ev.target.closest('.opt');
        if (!btn || locked) return;
        locked = true;
        const ok = btn.dataset.n === n;
        rights[i] = ok;
        box.querySelector(`[data-n="${n}"]`).classList.add('right');
        if (!ok) btn.classList.add('wrong');
        pairs[i].classList.add(ok ? 'ok' : 'bad');
        setTimeout(() => step(i + 1), ok ? 250 : 900);
      };
    };
    step(0);
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
    const per = TRIPLE.includes(this.cfg.mode) ? 'card' : 'answer';
    const missed = [...new Set([
      ...this.results.filter((r) => !r.correct && !Array.isArray(r.n)).map((r) => r.n),
      ...this.missedPairs,
    ])];
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
        <p>Average time per ${per}: <b>${avg}s</b></p>
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
