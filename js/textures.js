// Procedural canvas textures: wood desk, sketchbook paper with doodles, sticky notes, glow sprite.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function woodTexture() {
  const S = 1024;
  const c = makeCanvas(S, S), g = c.getContext('2d');
  const planks = 4, ph = S / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    g.fillStyle = `hsl(${26 + rnd(-2, 3)}, ${48 + rnd(-6, 6)}%, ${50 + rnd(-5, 5)}%)`;
    g.fillRect(0, y0, S, ph);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(80,42,16,${rnd(0.04, 0.16)})`;
      g.lineWidth = rnd(1, 3.5);
      g.beginPath();
      const yy = y0 + Math.random() * ph;
      const amp = rnd(1, 5), k = (Math.PI * 2 * Math.ceil(rnd(1, 4))) / S, phase = rnd(0, 6);
      for (let x = 0; x <= S; x += 16) {
        const y = yy + Math.sin(x * k + phase) * amp;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    // a knot or two
    if (Math.random() < 0.7) {
      const kx = rnd(100, S - 100), ky = y0 + rnd(30, ph - 30);
      for (let r = 26; r > 2; r -= 5) {
        g.strokeStyle = `rgba(70,35,12,${0.12 + (26 - r) / 120})`;
        g.lineWidth = 2;
        g.beginPath(); g.ellipse(kx, ky, r * 2.2, r * 0.8, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    g.fillStyle = 'rgba(50,25,8,0.45)';
    g.fillRect(0, y0, S, 3);
  }
  return toTex(c, true);
}

// wobbly hand-drawn polyline
function wob(g, pts, closed = false, j = 1.6) {
  g.beginPath();
  pts.forEach((p, i) => {
    const x = p[0] + rnd(-j, j), y = p[1] + rnd(-j, j);
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  });
  if (closed) g.closePath();
  g.stroke();
}

function circlePts(cx, cy, r, n = 28, rx = 1, ry = 1) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r * rx, cy + Math.sin(a) * r * ry]);
  }
  return pts;
}

function starPts(cx, cy, r) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

export function paperTexture(W, H) {
  // W,H in px (keep aspect of the paper mesh)
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#fdfaf1';
  g.fillRect(0, 0, W, H);

  // faint paper grain
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(120,110,90,${rnd(0.01, 0.04)})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  // ruled lines + margin
  const gap = Math.round(H / 26);
  g.strokeStyle = 'rgba(80,140,230,0.35)';
  g.lineWidth = 2;
  for (let y = gap * 2; y < H; y += gap) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = 'rgba(235,80,80,0.5)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(W * 0.09, 0); g.lineTo(W * 0.09, H); g.stroke();

  g.lineCap = 'round'; g.lineJoin = 'round';
  const pencil = 'rgba(55,55,70,0.75)';
  const S = H / 1000; // scale factor

  // title scribble
  g.save();
  g.translate(W * 0.5, H * 0.14); g.rotate(-0.05);
  g.font = `${110 * S}px "Permanent Marker", cursive`;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,77,77,0.85)';
  g.fillText('DOODLE DASH', 0, 0);
  g.strokeStyle = pencil; g.lineWidth = 4 * S;
  wob(g, [[-380 * S, 30 * S], [-100 * S, 40 * S], [200 * S, 28 * S], [390 * S, 36 * S]], false, 3);
  g.restore();

  const words = [
    ['vroom!', 0.22, 0.42, -0.2, 70],
    ['drift = boost', 0.72, 0.36, 0.08, 56],
    ['watch out for ducks!!', 0.6, 0.86, -0.04, 54],
    ['collect ★', 0.25, 0.76, 0.12, 60],
    ['2 + 2 = fish', 0.84, 0.62, -0.1, 46],
    ['made w/ Vi3W', 0.43, 0.56, 0.03, 52],
  ];
  g.fillStyle = pencil;
  for (const [t, x, y, r, s] of words) {
    g.save(); g.translate(W * x, H * y); g.rotate(r);
    g.font = `${s * S}px "Permanent Marker", cursive`;
    g.textAlign = 'center';
    g.fillText(t, 0, 0);
    g.restore();
  }

  g.strokeStyle = pencil; g.lineWidth = 5 * S;
  // spiral
  {
    const cx = W * 0.15, cy = H * 0.6, pts = [];
    for (let a = 0; a < Math.PI * 9; a += 0.2) pts.push([cx + Math.cos(a) * a * 4.2 * S, cy + Math.sin(a) * a * 4.2 * S]);
    wob(g, pts, false, 1);
  }
  // stars
  for (const [x, y, r] of [[0.33, 0.3, 50], [0.9, 0.2, 40], [0.55, 0.72, 34], [0.18, 0.88, 44], [0.95, 0.85, 30]]) {
    g.strokeStyle = 'rgba(230,170,20,0.9)';
    wob(g, starPts(W * x, H * y, r * S), true, 2);
  }
  g.strokeStyle = pencil;
  // little car doodle
  {
    const x = W * 0.76, y = H * 0.5;
    wob(g, [[x - 70 * S, y], [x - 70 * S, y - 30 * S], [x - 35 * S, y - 32 * S], [x - 15 * S, y - 60 * S], [x + 30 * S, y - 60 * S], [x + 50 * S, y - 32 * S], [x + 75 * S, y - 30 * S], [x + 75 * S, y], [x - 70 * S, y]], false, 2);
    wob(g, circlePts(x - 40 * S, y + 4 * S, 16 * S));
    wob(g, circlePts(x + 45 * S, y + 4 * S, 16 * S));
    for (let i = 0; i < 3; i++) wob(g, [[x - 95 * S - i * 22 * S, y - 20 * S + i * 12 * S], [x - 120 * S - i * 22 * S, y - 20 * S + i * 12 * S]]);
  }
  // duck doodle
  {
    const x = W * 0.43, y = H * 0.85;
    wob(g, circlePts(x, y, 40 * S, 30, 1.4, 0.9));
    wob(g, circlePts(x + 36 * S, y - 44 * S, 24 * S));
    g.strokeStyle = 'rgba(240,140,30,0.9)';
    wob(g, [[x + 58 * S, y - 46 * S], [x + 84 * S, y - 40 * S], [x + 58 * S, y - 34 * S]]);
    g.strokeStyle = pencil;
    g.fillStyle = pencil; g.beginPath(); g.arc(x + 42 * S, y - 50 * S, 4 * S, 0, 7); g.fill();
  }
  // arrows
  for (const [x, y, a] of [[0.6, 0.24, 0.3], [0.3, 0.5, -2.6], [0.9, 0.45, 1.7]]) {
    g.save(); g.translate(W * x, H * y); g.rotate(a);
    wob(g, [[-70 * S, 0], [70 * S, 0]]);
    wob(g, [[45 * S, -22 * S], [72 * S, 0], [45 * S, 22 * S]]);
    g.restore();
  }
  // lightning + heart + smiley
  g.strokeStyle = 'rgba(63,167,255,0.9)';
  {
    const x = W * 0.64, y = H * 0.62;
    wob(g, [[x, y - 50 * S], [x - 20 * S, y], [x + 6 * S, y], [x - 12 * S, y + 52 * S], [x + 28 * S, y - 8 * S], [x + 2 * S, y - 8 * S], [x + 18 * S, y - 50 * S]], true);
  }
  g.strokeStyle = 'rgba(255,110,170,0.9)';
  {
    const x = W * 0.08 + 60 * S, y = H * 0.3, pts = [];
    for (let t = 0; t <= Math.PI * 2; t += 0.15) {
      pts.push([x + 2.4 * S * 16 * Math.pow(Math.sin(t), 3), y - 2.4 * S * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
    }
    wob(g, pts, true, 1);
  }
  g.strokeStyle = pencil;
  {
    const x = W * 0.92, y = H * 0.32;
    wob(g, circlePts(x, y, 38 * S));
    g.fillStyle = pencil;
    g.beginPath(); g.arc(x - 13 * S, y - 10 * S, 5 * S, 0, 7); g.arc(x + 13 * S, y - 10 * S, 5 * S, 0, 7); g.fill();
    g.beginPath(); g.arc(x, y + 2 * S, 20 * S, 0.3, Math.PI - 0.3); g.stroke();
  }
  // math scribbles
  g.font = `${36 * S}px "Permanent Marker", cursive`;
  g.fillStyle = 'rgba(55,55,70,0.55)';
  g.fillText('E = mc²', W * 0.13, H * 0.2);
  g.fillText('v = d/t ?', W * 0.8, H * 0.95);

  return toTex(c);
}

export function stickyTexture(bg, text, rot = 0) {
  const S = 256;
  const c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, 'rgba(0,0,0,0.08)'); grad.addColorStop(0.2, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  g.save(); g.translate(S / 2, S / 2 + 12); g.rotate(rot);
  g.fillStyle = 'rgba(30,27,46,0.85)';
  g.textAlign = 'center';
  const lines = text.split('\n');
  g.font = `${lines.length > 1 ? 44 : 58}px "Permanent Marker", cursive`;
  lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * 52));
  g.restore();
  return toTex(c);
}

export function bookSideTexture() {
  const c = makeCanvas(256, 64), g = c.getContext('2d');
  g.fillStyle = '#f4efe2'; g.fillRect(0, 0, 256, 64);
  for (let y = 2; y < 64; y += 3) { g.fillStyle = `rgba(150,140,120,${rnd(0.15, 0.35)})`; g.fillRect(0, y, 256, 1); }
  return toTex(c);
}

export function rulerTexture() {
  const c = makeCanvas(1024, 128), g = c.getContext('2d');
  g.fillStyle = '#f5f0d8'; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#2a2a2a';
  for (let i = 0; i <= 100; i++) {
    const x = 12 + i * 10;
    const h = i % 10 === 0 ? 48 : i % 5 === 0 ? 34 : 20;
    g.fillRect(x, 0, 2, h);
    if (i % 10 === 0) { g.font = '22px Fredoka, sans-serif'; g.fillText(String(i / 10), x - 6, 76); }
  }
  return toTex(c);
}

export function glowTexture() {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function puffTexture() {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  for (let i = 0; i < 6; i++) {
    const x = 64 + rnd(-18, 18), y = 64 + rnd(-18, 18), r = rnd(24, 40);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}
