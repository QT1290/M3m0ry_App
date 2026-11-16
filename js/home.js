import * as store from './store.js';
import { streakCard } from './streak.js';
import { launch } from './train.js';

const FIELDS = ['person', 'action', 'object'];
const LABEL = { person: 'Person', action: 'Action', object: 'Object' };

const h = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let selected = null;

export function renderHome(view, title) {
  title.textContent = 'PAO Memory';
  const levels = store.NUMBERS.map((n) => store.level(n));
  const filled = levels.filter((l) => l > 0).length;
  const mastered = levels.filter((l) => l === 4).length;
  const unseen = levels.filter((l) => l === 1).length;
  const due = store.NUMBERS.filter((n) => store.isDue(n)).length;
  const { current, trainedToday } = store.getStreak();
  const doneToday = store.getRecord('dailyDone') === store.dayKey();
  const perfect = store.getRecallHistory().filter((r) => r.correct === r.digits);
  const bestRecall = perfect.length ? Math.max(...perfect.map((r) => r.digits)) : null;
  const ready = filled >= 4;

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up?' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  let sub;
  if (!ready) sub = 'Fill in at least 4 numbers to start training.';
  else if (doneToday) sub = 'Workout done for today. Nice work!';
  else if (current && !trainedToday) sub = `Train today to keep your ${current}-day streak.`;
  else if (due) sub = `${due} number${due === 1 ? ' is' : 's are'} ready for review.`;
  else sub = 'A few minutes a day keeps your list sharp.';

  view.innerHTML = `
    <section class="hero">
      <div class="hero-top">
        <div class="ring" style="--pct:${mastered}" role="img" aria-label="${mastered} of 100 numbers mastered">
          <div><b>${mastered}</b><small>mastered</small></div>
        </div>
        <div>
          <h2>${greeting}</h2>
          <p>${sub}</p>
        </div>
      </div>
      <div class="hero-cta">
        ${ready
          ? `<button class="btn ${doneToday ? 'done' : ''}" id="daily">${doneToday ? '✓ Done · Go again' : "Start today's workout"}</button>
             ${unseen ? '<button class="btn ghost" id="learn">Learn new</button>' : ''}`
          : '<a class="btn" href="#/pao">Fill in your list</a>'}
      </div>
    </section>

    <section class="tiles-2">
      <div class="stat s-due"><b>${due}</b><span>due for review</span></div>
      <div class="stat s-streak"><b>${unseen}</b><span>still to learn</span></div>
      <div class="stat s-chain"><b>${store.getRecord('chainBest') ?? '–'}</b><span>chain best</span></div>
      <div class="stat s-recall"><b>${bestRecall ?? '–'}</b><span>digits recalled perfectly</span></div>
    </section>

    ${streakCard()}

    <section class="card">
      <h2>Mastery map</h2>
      <p>Every number from 00 to 99. Tap one to see it.</p>
      <div class="map" id="map">
        ${store.NUMBERS.map((n, i) => `<button type="button" data-n="${n}" class="l${levels[i]} ${store.isDue(n) ? 'due' : ''}" aria-label="${n}, ${store.LEVEL_NAMES[levels[i]]}">${n}</button>`).join('')}
      </div>
      <div class="legend">
        ${store.LEVEL_NAMES.map((name, i) => `<span><i class="l${i}"></i>${name}</span>`).join('')}
        <span><i class="dot"></i>Due</span>
      </div>
      <div id="detail"></div>
    </section>
  `;

  view.querySelector('#daily')?.addEventListener('click', () => launch(view, title, { mode: 'daily', field: 'any', length: 20 }));
  view.querySelector('#learn')?.addEventListener('click', () => launch(view, title, { mode: 'learn', field: 'any', length: 5 }));

  const map = view.querySelector('#map');
  const detail = view.querySelector('#detail');
  const show = (n) => {
    selected = n;
    map.querySelectorAll('.sel').forEach((b) => b.classList.remove('sel'));
    if (!n) { detail.innerHTML = ''; return; }
    map.querySelector(`[data-n="${n}"]`).classList.add('sel');
    const e = store.getEntry(n);
    const s = store.getStats(n);
    const meta = s.seen
      ? `<span>${Math.round((s.correct / s.seen) * 100)}% right of ${s.seen}</span>
         ${s.avgMs ? `<span>${(s.avgMs / 1000).toFixed(1)}s average</span>` : ''}
         <span>${store.isDue(n) ? 'Due now' : `Next review ${when(s.due)}`}</span>`
      : '<span>Not trained yet</span>';
    detail.innerHTML = `
      <div class="detail">
        <div class="detail-head">
          <span class="num">${n}</span>
          <span class="lvl">${store.LEVEL_NAMES[store.level(n)]}</span>
          <a class="btn ghost" href="#/edit/${n}">Edit</a>
        </div>
        <div class="pao-rows">
          ${FIELDS.map((f) => `<div><i class="badge ${f}" title="${LABEL[f]}">${LABEL[f][0]}</i><span>${e[f] ? h(e[f]) : '<span class="empty">—</span>'}</span></div>`).join('')}
        </div>
        <div class="detail-meta">${meta}</div>
      </div>`;
  };
  map.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (btn) show(btn.dataset.n === selected ? null : btn.dataset.n);
  });
  if (selected) show(selected);
}

function when(ts) {
  const mins = Math.round((ts - Date.now()) / 60_000);
  if (mins < 60) return `in ${Math.max(1, mins)} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
