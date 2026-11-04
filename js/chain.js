import * as store from './store.js';
import { celebrate } from './streak.js';

// Chain: each line repeats the whole chain so far plus one new item.
// Missing the new item shows the answer and the game goes on; missing an
// item you got right on the line before ends the game.

const FIELDS = ['person', 'action', 'object'];
const LABEL = { person: 'Person', action: 'Action', object: 'Object' };

const h = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const filled = (n, f) => store.getEntry(n)[f].trim() !== '';

export class Chain {
  constructor(view, title, cfg) {
    this.view = view;
    this.title = title;
    this.cfg = cfg;
  }

  pool() {
    return store.NUMBERS.filter((n) => (this.cfg.field === 'any'
      ? FIELDS.some((f) => filled(n, f))
      : filled(n, this.cfg.field)));
  }

  start() {
    this.items = []; // { n, field }
    this.lastLine = []; // was each item right on the previous line?
    this.line = [];
    this.pos = 0;
    this.answers = 0;
    this.scored = new Set(); // numbers already counted for spaced repetition this game
    this.addItem();
    this.ask();
  }

  // Prefer numbers not in the chain yet; reuse them once all are used.
  addItem() {
    const used = new Set(this.items.map((it) => it.n));
    const pool = this.pool();
    const fresh = pool.filter((n) => !used.has(n));
    const last = this.items.at(-1)?.n;
    const n = pick(fresh.length ? fresh : pool.filter((m) => m !== last));
    const field = this.cfg.field !== 'any' ? this.cfg.field : pick(FIELDS.filter((f) => filled(n, f)));
    this.items.push({ n, field });
  }

  get lineNo() {
    return this.items.length;
  }

  ask() {
    this.title.textContent = 'Chain';
    const item = this.items[this.pos];
    const isNew = this.pos === this.items.length - 1;
    const t0 = Date.now();
    this.view.innerHTML = `
      <div class="session-bar">
        <span>Line <b>${this.lineNo}</b></span>
        <span class="chain-dots" aria-label="Item ${this.pos + 1} of ${this.lineNo}">
          ${this.items.map((_, i) => `<i class="${i < this.pos ? 'done' : i === this.pos ? 'now' : ''}"></i>`).join('')}
        </span>
        <a href="#/train" class="quit">Quit</a>
      </div>
      <div class="card-q">
        <p class="kind">${isNew ? '<span class="new-tag">New</span> ' : ''}${LABEL[item.field]}</p>
        <div class="cue">${h(store.getEntry(item.n)[item.field])}</div>
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
      if (form.dataset.state === 'wrong') return this.advance();
      if (form.dataset.state) return;
      const val = input.value.trim();
      if (!/^\d{1,2}$/.test(val)) return;
      const correct = val.padStart(2, '0') === item.n;
      form.dataset.state = correct ? 'right' : 'wrong';
      input.readOnly = true;
      // Repeating an item many times in one game shouldn't mark it as mastered:
      // only its first answer and any later miss count for spaced repetition.
      if (!this.scored.has(item.n) || !correct) store.recordAnswer(item.n, correct, Date.now() - t0);
      this.scored.add(item.n);
      this.answers++;
      this.line[this.pos] = correct;
      const fb = this.view.querySelector('.feedback');
      if (correct) {
        fb.className = 'feedback ok';
        fb.textContent = 'Correct!';
        setTimeout(() => this.advance(), 450);
      } else if (this.lastLine[this.pos]) {
        // Right on the line before, wrong now: game over.
        this.gameOver(item, val);
      } else {
        fb.className = 'feedback bad';
        fb.innerHTML = `It's <b>${item.n}</b>: ${h(describe(item.n))}`;
        form.querySelector('button').textContent = 'Next';
        form.querySelector('button').focus();
      }
    });
  }

  advance() {
    this.pos++;
    if (this.pos >= this.items.length) {
      this.lastLine = this.line;
      this.line = [];
      this.pos = 0;
      this.addItem();
    }
    this.ask();
  }

  gameOver(item, given) {
    // A line counts once every item in it was answered; the current one wasn't finished.
    const score = this.lineNo - 1;
    const best = store.getRecord('chainBest') ?? 0;
    const record = score > best;
    if (record) store.setRecord('chainBest', score);
    const streakLine = this.answers ? celebrate(store.logActivity()) : '';
    this.title.textContent = 'Chain over';
    this.view.innerHTML = `
      <section class="card results">
        <p class="kind">Longest line</p>
        <div class="bignum">${score}</div>
        ${record ? '<p class="record">New personal best!</p>' : `<p class="hint">Personal best: ${best}</p>`}
        ${streakLine}
        <p>You typed <b>${h(given.padStart(2, '0'))}</b> for ${LABEL[item.field].toLowerCase()} “${h(store.getEntry(item.n)[item.field])}”. It's <b>${item.n}</b>.</p>
      </section>
      <section class="card">
        <h2>The chain</h2>
        <ol class="chain-list">
          ${this.items.map((it) => `<li><a href="#/edit/${it.n}"><span class="num">${it.n}</span><span>${h(describe(it.n))}</span></a></li>`).join('')}
        </ol>
      </section>
      <div class="actions">
        <a class="btn big ghost" href="#/train">Done</a>
        <button class="btn big" id="again">Play again</button>
      </div>`;
    this.view.querySelector('#again').addEventListener('click', () => this.start());
  }
}

function describe(n) {
  const e = store.getEntry(n);
  return FIELDS.map((f) => e[f]).filter(Boolean).join(' · ');
}
