// Small rewards and feedback: confetti for wins, a short buzz for misses.

const COLORS = ['#7c4dff', '#b15cff', '#ff7a2f', '#ffb938', '#0b9384', '#e8542f', '#3ccf85'];

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:10';
  document.body.append(layer);
  let longest = 0;
  for (let i = 0; i < 70; i++) {
    const bit = document.createElement('i');
    const size = 6 + Math.random() * 6;
    bit.style.cssText = `position:absolute;top:-16px;left:${Math.random() * 100}%;width:${size}px;height:${size * (0.4 + Math.random() * 0.8)}px;`
      + `background:${COLORS[i % COLORS.length]};border-radius:${Math.random() < 0.3 ? '50%' : '2px'}`;
    layer.append(bit);
    const duration = 1400 + Math.random() * 1400;
    const delay = Math.random() * 350;
    longest = Math.max(longest, duration + delay);
    bit.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${(Math.random() - 0.5) * 220}px, ${innerHeight + 40}px) rotate(${(Math.random() - 0.5) * 1080}deg)`, opacity: 0.9 },
    ], { duration, delay, easing: 'cubic-bezier(0.2, 0.6, 0.6, 1)', fill: 'forwards' });
  }
  setTimeout(() => layer.remove(), longest + 100);
}

// Short vibration on a wrong answer (phones that support it).
export function buzz() {
  try { navigator.vibrate?.(60); } catch { /* not supported */ }
}
