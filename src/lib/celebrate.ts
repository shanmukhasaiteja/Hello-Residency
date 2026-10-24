// A short confetti burst for happy moments (hi sent, new connection). Purely decorative:
// hidden from screen readers and skipped entirely when the user prefers reduced motion.

const COLORS = ['#0B7A7C', '#F4B63F', '#9A47C2', '#D6336C', '#3B6FE0', '#F7894A'];

export function celebrate(count = 36): void {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const distance = 120 + Math.random() * 160;
    piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--y', `${Math.sin(angle) * distance - 80}px`);
    piece.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    piece.style.background = COLORS[i % COLORS.length];
    piece.style.animationDelay = `${Math.random() * 80}ms`;
    if (i % 3 === 0) piece.style.borderRadius = '50%';
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1400);
}
