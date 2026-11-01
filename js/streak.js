import * as store from './store.js';

// Flame badge in the top bar.
export function updateBadge() {
  const el = document.getElementById('streak');
  if (!el) return;
  const { current, trainedToday } = store.getStreak();
  el.hidden = current === 0;
  el.classList.toggle('pending', !trainedToday);
  el.querySelector('b').textContent = current;
  el.title = trainedToday
    ? `${current}-day streak`
    : `${current}-day streak: train today to keep it`;
}

// Card with the streak and the last 7 days, for the Train and Recall tabs.
export function streakCard() {
  const { current, best, trainedToday } = store.getStreak();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const message = current === 0
    ? 'Finish a session or recall test to start a streak.'
    : trainedToday
      ? 'Done for today. See you tomorrow!'
      : 'Finish one session today to keep your streak.';
  return `
    <section class="card streak-card ${trainedToday ? 'done' : ''}">
      <div class="streak-main">
        <span class="flame" aria-hidden="true">🔥</span>
        <div>
          <b>${current} day${current === 1 ? '' : 's'}</b>
          <small>Best: ${best}</small>
        </div>
      </div>
      <ol class="week" aria-label="Last 7 days">
        ${days.map((d, i) => `
          <li class="${store.didTrainOn(d) ? 'on' : ''} ${i === 6 ? 'today' : ''}">
            <span>${d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            <i></i>
          </li>`).join('')}
      </ol>
      <p>${message}</p>
    </section>`;
}

// Shown on a results screen after logging a session.
export function celebrate(firstToday) {
  updateBadge();
  if (!firstToday) return '';
  const { current } = store.getStreak();
  return `<p class="streak-up">🔥 ${current === 1 ? 'Streak started!' : `${current}-day streak!`}</p>`;
}
