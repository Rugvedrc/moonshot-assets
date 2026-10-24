// Doodle Dash — a tiny racer on a giant desk.
// Every 3D model (car, pencil, duck, star) was generated with Vi3W (app.vi3w.in).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as TX from './textures.js';
import { Sound } from './audio.js';

// ---------------------------------------------------------------- helpers
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

// ---------------------------------------------------------------- tuning
const HALF_W = 32, HALF_D = 22;          // desk is 64 x 44
const GAME_TIME = 60;
const STEP = 0.5;                        // max height the car can drive up without a ramp
const GRAV = 26;
const CAR_R = 1.0, DUCK_R = 1.9, DUCK_MASS = 2.2;
const ACC = 21, BRAKE = 36, REV_ACC = 14, MAXV = 19, MAXB = 29, MAXREV = 7, TURN = 2.7;
const COMBO_WINDOW = 3.2;
const SPAWN = { x: 0, z: -17, th: 0 };

// Model "forward" fixes (radians) so each model faces +Z in game space.
const FIX = { car: 0, duck: 0, pencil: 0, star: 0 };

const MODELS = {
  car: { file: 'models/car.glb', size: 2.4, name: 'Toy Racer', role: 'That’s you. Drifts, jumps and bonks ducks.' },
  pencil: { file: 'models/pencil.glb', size: 10, name: 'Giant Pencil', role: 'Obstacles scattered across the desk. Jump them!' },
  duck: { file: 'models/duck.glb', size: 4.2, name: 'Rubber Duck', role: 'Falls from the sky. Boost into it to knock it off the desk.' },
  star: { file: 'models/star.glb', size: 1.5, name: 'Gold Star', role: 'Grab them fast to build combos. Pink ones add time.' },
};

// ---------------------------------------------------------------- renderer
const canvas = $('game');
const isTouchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = gradientBg('#9fd4ff', '#ffe9c9');
scene.fog = new THREE.Fog('#ffe6c4', 90, 210);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 30, -50);

scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a6a4a, 1.0));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.7);
sun.position.set(20, 38, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouchDevice ? 1024 : 2048, isTouchDevice ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 34, bottom: -34, near: 1, far: 100 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xa9cfff, 0.6);
fill.position.set(-20, 14, -24);
scene.add(fill);

function gradientBg(top, bottom) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const sound = new Sound();

// ---------------------------------------------------------------- level geometry (colliders)
const SOLIDS = [];
function addSolid(kind, cx, cz, rot, hx, hz, H) {
  const s = { kind, cx, cz, rot, hx, hz, H, c: Math.cos(rot), s: Math.sin(rot) };
  SOLIDS.push(s);
  return s;
}
function toLocal(s, x, z) { const dx = x - s.cx, dz = z - s.cz; return [dx * s.c - dz * s.s, dx * s.s + dz * s.c]; }
function toWorldDir(s, lx, lz) { return [lx * s.c + lz * s.s, -lx * s.s + lz * s.c]; }
function solidH(s, lx) { return s.kind === 'box' ? s.H : s.H * clamp((lx + s.hx) / (2 * s.hx), 0, 1); }
const onDesk = (x, z) => Math.abs(x) <= HALF_W && Math.abs(z) <= HALF_D;

function groundAt(x, z, y) {
  let h = onDesk(x, z) ? 0 : -Infinity;
  for (const s of SOLIDS) {
    const [lx, lz] = toLocal(s, x, z);
    if (Math.abs(lx) <= s.hx && Math.abs(lz) <= s.hz) {
      const hs = solidH(s, lx);
      if (hs <= y + STEP && hs > h) h = hs;
    }
  }
  return h;
}

// push entity e {x,z,y,vx,vz} out of any solid it is "inside" below the top
function collideSolids(e, r, bounce = 1.5) {
  let impact = 0;
  for (const s of SOLIDS) {
    let [lx, lz] = toLocal(s, e.x, e.z);
    const ex = s.hx + r, ez = s.hz + r;
    if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
    const hs = solidH(s, clamp(lx, -s.hx, s.hx));
    if (e.y >= hs - STEP) continue;
    const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
    let nlx = 0, nlz = 0;
    if (px < pz) { nlx = Math.sign(lx) || 1; lx = nlx * ex; } else { nlz = Math.sign(lz) || 1; lz = nlz * ez; }
    const [wx, wz] = toWorldDir(s, lx, lz);
    e.x = s.cx + wx; e.z = s.cz + wz;
    const [nx, nz] = toWorldDir(s, nlx, nlz);
    const vn = e.vx * nx + e.vz * nz;
    if (vn < 0) { e.vx -= bounce * vn * nx; e.vz -= bounce * vn * nz; impact = Math.max(impact, -vn); }
  }
  return impact;
}

const PENCILS = [];
function capsuleDist(p, x, z) {
  const abx = p.bx - p.ax, abz = p.bz - p.az;
  const t = clamp(((x - p.ax) * abx + (z - p.az) * abz) / (abx * abx + abz * abz), 0, 1);
  const cx = p.ax + abx * t, cz = p.az + abz * t;
  return { d: Math.hypot(x - cx, z - cz), cx, cz };
}
function collidePencils(e, r, bounce = 1.5) {
  let impact = 0;
  for (const p of PENCILS) {
    if (e.y > p.top - 0.35) continue;
    const { d, cx, cz } = capsuleDist(p, e.x, e.z);
    const m = r + p.r;
    if (d >= m || d < 1e-5) continue;
    const nx = (e.x - cx) / d, nz = (e.z - cz) / d;
    e.x = cx + nx * m; e.z = cz + nz * m;
    const vn = e.vx * nx + e.vz * nz;
    if (vn < 0) { e.vx -= bounce * vn * nx; e.vz -= bounce * vn * nz; impact = Math.max(impact, -vn); }
  }
  return impact;
}

// ---------------------------------------------------------------- static world
const woodTex = TX.woodTexture();
woodTex.repeat.set(2, 1.4);
const AIR_SLOTS = [];

function buildWorld() {
  // desk
  const deskMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.75 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 2.4, HALF_D * 2), deskMat);
  desk.position.y = -1.2;
  desk.receiveShadow = true;
  scene.add(desk);
  // desk legs fading into the fog
  const legMat = new THREE.MeshStandardMaterial({ color: 0x7a4b28, roughness: 0.8 });
  for (const [x, z] of [[-29, -19], [29, -19], [-29, 19], [29, 19]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2.6, 60, 2.6), legMat);
    leg.position.set(x, -32.4, z);
    scene.add(leg);
  }

  // sketchbook
  const PW = 36, PD = 26, px = -2, pz = 2;
  const under = new THREE.Mesh(new THREE.PlaneGeometry(PW + 0.6, PD + 0.6), new THREE.MeshStandardMaterial({ color: 0x2c3e66, roughness: 0.9 }));
  under.rotation.x = -Math.PI / 2; under.position.set(px, 0.006, pz); under.receiveShadow = true;
  scene.add(under);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), new THREE.MeshStandardMaterial({ map: TX.paperTexture(2048, Math.round(2048 * PD / PW)), roughness: 0.95 }));
  paper.rotation.set(-Math.PI / 2, 0, Math.PI);
  paper.position.set(px, 0.012, pz);
  paper.receiveShadow = true;
  scene.add(paper);
  // spiral binding along the far edge
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc8, metalness: 0.9, roughness: 0.3 });
  const ringGeo = new THREE.TorusGeometry(0.45, 0.07, 8, 20);
  for (let i = 0; i < 26; i++) {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(px - PW / 2 + 1 + i * ((PW - 2) / 25), 0.05, pz + PD / 2 - 0.3);
    ring.rotation.y = Math.PI / 2;
    ring.castShadow = true;
    scene.add(ring);
  }

  // sticky notes
  const notes = [
    [24, -5, 0.2, '#ffe066', 'GO\nFAST!'],
    [-27, -3, -0.25, '#ff9ecb', 'no ducks\nallowed'],
    [4, 19, 0.1, '#8fe3ff', 'jump →'],
    [27, 16, -0.15, '#b6f28a', 'Vi3W\n3D in 3\nclicks'],
  ];
  for (const [x, z, r, col, txt] of notes) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshStandardMaterial({ map: TX.stickyTexture(col, txt), roughness: 0.9 }));
    m.rotation.set(-Math.PI / 2, 0, r + Math.PI);
    m.position.set(x, 0.018, z);
    m.receiveShadow = true;
    scene.add(m);
  }

  // ruler (tiny bump you can drive over)
  {
    const rot = 0.15, s = addSolid('box', -19, -18, rot, 10, 1.2, 0.18);
    const mats = [0, 0, 1, 0, 0, 0].map((i) => i ? new THREE.MeshStandardMaterial({ map: TX.rulerTexture(), roughness: 0.4 }) : new THREE.MeshStandardMaterial({ color: 0xe8e0bb, roughness: 0.4 }));
    const m = new THREE.Mesh(new THREE.BoxGeometry(20, 0.18, 2.4), mats);
    m.position.set(s.cx, 0.09, s.cz); m.rotation.y = rot;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  // stack of books + ramp up to it
  {
    const rot = 0.05, cx = 18, cz = 10, hx = 5.3, hz = 3.8, H = 1.6;
    addSolid('box', cx, cz, rot, hx, hz, H);
    const side = TX.bookSideTexture();
    const mkBook = (color, y, r, sx, sz) => {
      const cover = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
      const pages = new THREE.MeshStandardMaterial({ map: side, roughness: 0.9 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.8, sz), [pages, cover, cover, cover, pages, pages]);
      b.position.set(cx, y, cz); b.rotation.y = r;
      b.castShadow = b.receiveShadow = true;
      scene.add(b);
    };
    mkBook(0x3fa7ff, 0.4, rot, hx * 2 + 0.3, hz * 2 + 0.3);
    mkBook(0xff4d4d, 1.2, rot + 0.02, hx * 2, hz * 2);
    const rhx = 3.5;
    const [ox, oz] = [-(hx + rhx) * Math.cos(rot), (hx + rhx) * Math.sin(rot)];
    addRamp(cx + ox, cz + oz, rot, rhx, 2.4, H, false);
  }

  // jump ramps
  addRamp(-14, -8, -Math.PI / 2, 2.6, 2.3, 2.0, true);
  addRamp(-20, 15, 0, 2.6, 2.3, 2.0, true);
  addRamp(20, -12, Math.PI, 2.6, 2.3, 2.0, true);

  // pencils
  for (const [x, z, a] of [[-24, 4, 0.35], [6.5, 1, 2.4], [12, -19, 1.45], [27, 1, 0.1], [-26, -13, 0.9], [-1, 19.6, 1.62]]) {
    addPencilCollider(x, z, a);
  }
}

const rampMats = [
  new THREE.MeshStandardMaterial({ color: 0xe9c48a, roughness: 0.7 }),
  new THREE.MeshStandardMaterial({ color: 0xff5a4f, roughness: 0.55 }),
];
function addRamp(cx, cz, rot, hx, hz, H, jump) {
  addSolid('ramp', cx, cz, rot, hx, hz, H);
  const shape = new THREE.Shape([new THREE.Vector2(-hx, 0), new THREE.Vector2(hx, 0), new THREE.Vector2(hx, H)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: hz * 2, bevelEnabled: false });
  geo.translate(0, 0, -hz);
  const m = new THREE.Mesh(geo, rampMats);
  m.position.set(cx, 0, cz); m.rotation.y = rot;
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  // white chevrons on the slope
  const chevMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 2; i++) {
    const t = 0.3 + i * 0.35;
    const lx = -hx + t * 2 * hx;
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.5, hz * 1.4), chevMat);
    const slope = Math.atan2(H, 2 * hx);
    const g = new THREE.Group();
    g.position.set(lx, t * H + 0.02, 0);
    g.rotation.z = slope;
    c.rotation.x = -Math.PI / 2;
    g.add(c); m.add(g);
  }
  if (jump) {
    const [dx, dz] = [Math.cos(rot), -Math.sin(rot)];
    AIR_SLOTS.push({ x: cx + dx * (hx + 6), z: cz + dz * (hx + 6), y: H + 1.4, used: false });
  }
}

function addPencilCollider(x, z, a) {
  const L = MODELS.pencil.size, r = 1.15;
  const dx = Math.sin(a) * (L / 2 - r), dz = Math.cos(a) * (L / 2 - r);
  PENCILS.push({ x, z, a, ax: x - dx, az: z - dz, bx: x + dx, bz: z + dz, r, top: 2.3 });
}

// ---------------------------------------------------------------- skid marks (drawn into a canvas over the desk)
const SKID_SCALE = isTouchDevice ? 16 : 32;
const skidCanvas = document.createElement('canvas');
skidCanvas.width = HALF_W * 2 * SKID_SCALE; skidCanvas.height = HALF_D * 2 * SKID_SCALE;
const skidCtx = skidCanvas.getContext('2d');
const skidTex = new THREE.CanvasTexture(skidCanvas);
skidTex.colorSpace = THREE.SRGBColorSpace;
{
  const m = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_D * 2), new THREE.MeshBasicMaterial({ map: skidTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03;
  scene.add(m);
}
let skidDirty = false;
function skidLine(x0, z0, x1, z1, w, alpha) {
  const S = SKID_SCALE;
  skidCtx.strokeStyle = `rgba(45,45,60,${alpha})`;
  skidCtx.lineWidth = w * S;
  skidCtx.lineCap = 'butt';
  skidCtx.beginPath();
  skidCtx.moveTo((x0 + HALF_W) * S, (z0 + HALF_D) * S);
  skidCtx.lineTo((x1 + HALF_W) * S, (z1 + HALF_D) * S);
  skidCtx.stroke();
  skidDirty = true;
}
function clearSkids() { skidCtx.clearRect(0, 0, skidCanvas.width, skidCanvas.height); skidTex.needsUpdate = true; }

// ---------------------------------------------------------------- particles
const glowTex = TX.glowTexture();
const puffTex = TX.puffTexture();
class Particles {
  constructor(tex, blending, n) {
    this.items = [];
    this.i = 0;
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending, fog: true }));
      s.visible = false;
      scene.add(s);
      this.items.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, s0: 1, s1: 1, a: 1 });
    }
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, color, g = 0, drag = 0, a = 1) {
    const p = this.items[this.i];
    this.i = (this.i + 1) % this.items.length;
    Object.assign(p, { vx, vy, vz, life, max: life, s0, s1, g, drag, a });
    p.s.position.set(x, y, z);
    p.s.material.color.set(color);
    p.s.material.opacity = a;
    p.s.scale.setScalar(s0);
    p.s.visible = true;
  }
  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.vy -= p.g * dt;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(lerp(p.s0, p.s1, k));
      p.s.material.opacity = p.a * (1 - k * k);
    }
  }
  clear() { for (const p of this.items) { p.life = 0; p.s.visible = false; } }
}
const smoke = new Particles(puffTex, THREE.NormalBlending, 160);
const sparks = new Particles(glowTex, THREE.AdditiveBlending, 260);

function burst(x, y, z, color, n, speed, life = 0.6, size = 0.5, g = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, u = rand(-0.3, 1);
    const sp = speed * rand(0.4, 1);
    sparks.spawn(x, y, z, Math.cos(a) * sp * Math.sqrt(1 - u * u), u * sp + speed * 0.3, Math.sin(a) * sp * Math.sqrt(1 - u * u), life * rand(0.6, 1.2), size, size * 0.2, color, g, 1.5);
  }
}
function puffRing(x, y, z, n, speed, size = 1.2, color = 0xffffff) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    smoke.spawn(x + Math.cos(a) * 1.5, y + 0.3, z + Math.sin(a) * 1.5, Math.cos(a) * speed, rand(0.5, 1.5), Math.sin(a) * speed, rand(0.5, 0.9), size, size * 2.4, color, -1, 3, 0.8);
  }
}

// ---------------------------------------------------------------- popups / text
const popupsEl = $('popups');
const popups = [];
const _v = new THREE.Vector3();
function popup(text, x, y, z, color = '#fff', big = false) {
  const el = document.createElement('div');
  el.className = 'popup' + (big ? ' big' : '');
  el.textContent = text;
  el.style.color = color;
  el.style.left = '0px'; el.style.top = '0px';
  popupsEl.appendChild(el);
  popups.push({ el, x, y, z, t: 0, life: big ? 1.4 : 1.0, dx: rand(-20, 20) });
}
function updatePopups(dt) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.t += dt;
    if (p.t >= p.life) { p.el.remove(); popups.splice(i, 1); continue; }
    _v.set(p.x, p.y + p.t * 2.2, p.z).project(camera);
    if (_v.z > 1) { p.el.style.opacity = 0; continue; }
    const sx = (_v.x * 0.5 + 0.5) * innerWidth + p.dx * p.t, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
    const k = p.t / p.life;
    const sc = k < 0.15 ? lerp(0.4, 1.15, k / 0.15) : lerp(1.15, 1, Math.min(1, (k - 0.15) * 4));
    p.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${sc})`;
    p.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
  }
}
function clearPopups() { popups.forEach((p) => p.el.remove()); popups.length = 0; }

const centerEl = $('center-text');
let centerTimer = 0;
function centerText(txt, dur = 0.9, color) {
  centerEl.textContent = txt;
  centerEl.style.color = color || '';
  centerEl.classList.remove('go'); void centerEl.offsetWidth; centerEl.classList.add('go');
  centerEl.style.opacity = 1;
  centerTimer = dur;
}

// ---------------------------------------------------------------- model loading
const proto = {};
const modelStats = {};

function prepModel(key, gltf) {
  const src = gltf.scene;
  let tris = 0;
  src.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const g = o.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const m = o.material;
    m.flatShading = false;
    m.metalness = 0;
    m.roughness = 0.55;
    if (key === 'star') { m.metalness = 0.55; m.roughness = 0.28; m.emissive = new THREE.Color(0xffb400); m.emissiveIntensity = 0.25; }
    if (key === 'duck' || key === 'car') m.roughness = 0.42;
    m.needsUpdate = true;
  });
  src.rotation.y = FIX[key];
  const holder = new THREE.Group();
  holder.add(src);
  const box = new THREE.Box3().setFromObject(src);
  const size = box.getSize(new THREE.Vector3());
  src.scale.setScalar(MODELS[key].size / Math.max(size.x, size.y, size.z));
  src.updateMatrixWorld(true);
  box.setFromObject(src);
  const c = box.getCenter(new THREE.Vector3());
  src.position.set(-c.x, -box.min.y, -c.z);
  holder.updateMatrixWorld(true);
  const fb = new THREE.Box3().setFromObject(holder);
  proto[key] = holder;
  modelStats[key] = { ...(modelStats[key] || {}), tris, dims: fb.getSize(new THREE.Vector3()) };
}

function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const fl = new THREE.FileLoader();
  fl.setResponseType('arraybuffer');
  const keys = Object.keys(MODELS);
  const prog = {};
  const report = () => onProgress(keys.reduce((s, k) => s + (prog[k] || 0), 0) / keys.length);
  return Promise.all(keys.map((k) => new Promise((resolve, reject) => {
    fl.load(MODELS[k].file, (buf) => {
      prog[k] = 1; report();
      modelStats[k] = { bytes: buf.byteLength };
      loader.parse(buf, '', (g) => { prepModel(k, g); resolve(); }, reject);
    }, (e) => { if (e.total) { prog[k] = e.loaded / e.total * 0.95; report(); } }, reject);
  })));
}

// ---------------------------------------------------------------- game entities
const car = {
  x: SPAWN.x, z: SPAWN.z, y: 0, vx: 0, vz: 0, vy: 0, th: SPAWN.th,
  grounded: true, drifting: false, driftDir: 0, driftT: 0, driftLvl: 0, boostT: 0, boostLvl: 0,
  airT: 0, pitch: 0, roll: 0, steerS: 0, squash: 0, driftVis: 0, hop: 0, invuln: 0,
  prevWheels: null, speed: 0, accelVis: 0,
};
let carG, carPivot;
const ducks = [];
const stars = [];
let superStar = null;
const ringGeo = new THREE.RingGeometry(1.7, 2.3, 40);

function setupEntities() {
  carG = new THREE.Group();
  carPivot = new THREE.Group();
  carPivot.add(proto.car.clone());
  carG.add(carPivot);
  scene.add(carG);

  for (const p of PENCILS) {
    const m = proto.pencil.clone();
    m.position.set(p.x, 0, p.z);
    m.rotation.y = p.a;
    scene.add(m);
  }

  for (let i = 0; i < 6; i++) stars.push(makeStar(false));
  superStar = makeStar(true);
}

function makeStar(isSuper) {
  const o = proto.star.clone();
  if (isSuper) {
    o.traverse((m) => {
      if (m.isMesh) {
        m.material = m.material.clone();
        m.material.color = new THREE.Color(0xff8fc8);
        m.material.emissive = new THREE.Color(0xff3d9a);
        m.material.emissiveIntensity = 0.45;
      }
    });
    o.scale.setScalar(1.45);
  }
  o.visible = false;
  scene.add(o);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: isSuper ? 0xff6fb5 : 0xffd23f, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(isSuper ? 5.5 : 3.4);
  glow.visible = false;
  scene.add(glow);
  return { o, glow, isSuper, active: false, x: 0, z: 0, y: 0, t: Math.random() * 10, spawnT: 0, respawnT: 0, slot: null, life: 0 };
}

function findStarSpot(margin = 3) {
  for (let tries = 0; tries < 80; tries++) {
    const x = rand(-HALF_W + margin, HALF_W - margin), z = rand(-HALF_D + margin, HALF_D - margin);
    if (Math.hypot(x - car.x, z - car.z) < 7) continue;
    if (stars.some((s) => s.active && Math.hypot(s.x - x, s.z - z) < 6)) continue;
    if (PENCILS.some((p) => capsuleDist(p, x, z).d < p.r + 1.4)) continue;
    if (ducks.some((d) => d.state !== 'fall' && Math.hypot(d.x - x, d.z - z) < DUCK_R + 1.8)) continue;
    let y = 0, bad = false;
    for (const s of SOLIDS) {
      const [lx, lz] = toLocal(s, x, z);
      const inside = Math.abs(lx) < s.hx - 1.4 && Math.abs(lz) < s.hz - 1.4;
      const near = Math.abs(lx) < s.hx + 1.4 && Math.abs(lz) < s.hz + 1.4;
      if (s.kind === 'box' && s.H > 1) { if (inside) y = s.H; else if (near) bad = true; }
      else if (s.kind === 'ramp' && near) bad = true;
    }
    if (bad) continue;
    return { x, z, y };
  }
  return { x: rand(-10, 10), z: rand(-6, 6), y: 0 };
}

function placeStar(st) {
  if (st.slot) { st.slot.used = false; st.slot = null; }
  const free = AIR_SLOTS.filter((s) => !s.used && Math.hypot(s.x - car.x, s.z - car.z) > 8);
  if (!st.isSuper && free.length && Math.random() < 0.3) {
    const s = free[Math.floor(Math.random() * free.length)];
    s.used = true; st.slot = s;
    st.x = s.x; st.z = s.z; st.y = s.y;
  } else {
    const p = findStarSpot(st.isSuper ? 5 : 3);
    st.x = p.x; st.z = p.z; st.y = p.y + 0.5;
  }
  st.active = true; st.spawnT = 0; st.life = st.isSuper ? 9 : Infinity;
  st.o.visible = true; st.glow.visible = true;
}

function hideStar(st) {
  st.active = false; st.o.visible = false; st.glow.visible = false;
  if (st.slot) { st.slot.used = false; st.slot = null; }
}

function makeDuck() {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(proto.duck.clone());
  g.add(inner);
  scene.add(g);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  const d = { g, inner, ring, x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, yaw: rand(0, 6), state: 'walk', t: rand(0, 10), tx: 0, tz: 0, retarget: 0, hitT: 0, lastHit: -99, squash: 0, chaser: false, spin: 0 };
  ducks.push(d);
  return d;
}

function removeDuck(d) {
  scene.remove(d.g); scene.remove(d.ring);
  ducks.splice(ducks.indexOf(d), 1);
}

function duckSpot(nearCar) {
  for (let i = 0; i < 60; i++) {
    let x, z;
    if (nearCar && i < 20) {
      const f = [Math.sin(car.th), Math.cos(car.th)];
      x = car.x + f[0] * rand(6, 12) + rand(-3, 3); z = car.z + f[1] * rand(6, 12) + rand(-3, 3);
    } else { x = rand(-HALF_W + 5, HALF_W - 5); z = rand(-HALF_D + 5, HALF_D - 5); }
    if (Math.abs(x) > HALF_W - 4 || Math.abs(z) > HALF_D - 4) continue;
    if (PENCILS.some((p) => capsuleDist(p, x, z).d < p.r + DUCK_R + 0.5)) continue;
    if (SOLIDS.some((s) => { const [lx, lz] = toLocal(s, x, z); return Math.abs(lx) < s.hx + DUCK_R && Math.abs(lz) < s.hz + DUCK_R; })) continue;
    if (ducks.some((d) => Math.hypot(d.x - x, d.z - z) < DUCK_R * 2.5)) continue;
    return [x, z];
  }
  return [rand(-8, 8), rand(-5, 5)];
}

function dropDuck(nearCar = false) {
  const d = makeDuck();
  [d.x, d.z] = duckSpot(nearCar);
  d.y = 34; d.vy = 0; d.state = 'drop';
  d.ring.position.set(d.x, 0.04, d.z);
  d.ring.visible = true;
  d.tx = d.x; d.tz = d.z;
  return d;
}

function spawnWalkingDuck() {
  const d = makeDuck();
  [d.x, d.z] = duckSpot(false);
  d.tx = d.x; d.tz = d.z;
  return d;
}

// ---------------------------------------------------------------- input
const keys = {};
const touch = { left: false, right: false, brake: false, drift: false };
let usingTouch = matchMedia('(pointer: coarse)').matches;
if (usingTouch) document.body.classList.add('touch');
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  sound.init();
  if (usingTouch && /^(Key[WASD]|Arrow)/.test(e.code)) { usingTouch = false; document.body.classList.remove('touch'); refreshTouch(); }
  onKeyPress(e.code);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (mode === 'playing' || mode === 'countdown') pauseGame(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'playing' || mode === 'countdown') pauseGame(); sound.suspend(); }
  else sound.resume();
});
addEventListener('pointerdown', () => sound.init(), { capture: true });
addEventListener('touchstart', () => { if (!usingTouch) { usingTouch = true; document.body.classList.add('touch'); refreshTouch(); } }, { passive: true, capture: true });

document.querySelectorAll('.t-btn').forEach((b) => {
  const k = b.dataset.k;
  const on = (e) => { e.preventDefault(); touch[k] = true; b.classList.add('on'); };
  const off = (e) => { e.preventDefault(); touch[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('pointerleave', off);
});

function getInput() {
  const k = keys;
  const left = k.KeyA || k.ArrowLeft || touch.left;
  const right = k.KeyD || k.ArrowRight || touch.right;
  const brake = k.KeyS || k.ArrowDown || touch.brake;
  let throttle = k.KeyW || k.ArrowUp ? 1 : 0;
  if (usingTouch && !brake) throttle = 1;
  return { throttle, brake: brake ? 1 : 0, steer: (right ? 1 : 0) - (left ? 1 : 0), drift: !!(k.Space || k.ShiftLeft || k.ShiftRight || touch.drift) };
}

function onKeyPress(code) {
  if (code === 'KeyM') toggleMute();
  if (mode === 'title' && (code === 'Enter' || code === 'Space')) startGame();
  else if (mode === 'results' && (code === 'Enter' || code === 'KeyR')) startGame();
  else if ((mode === 'playing' || mode === 'countdown') && (code === 'Escape' || code === 'KeyP')) pauseGame();
  else if (mode === 'paused' && (code === 'Escape' || code === 'KeyP')) resumeGame();
  else if ((mode === 'playing' || mode === 'paused') && code === 'KeyR') startGame();
  else if (mode === 'showcase') {
    if (code === 'ArrowRight' || code === 'KeyD') showcaseGo(1);
    if (code === 'ArrowLeft' || code === 'KeyA') showcaseGo(-1);
    if (code === 'Escape') showTitle();
  }
}

// ---------------------------------------------------------------- game state
let mode = 'loading';
let pausedFrom = null;
let timeLeft = GAME_TIME, elapsed = 0, countdownT = 0, finishT = 0;
let score = 0, shownScore = 0, combo = 1, comboT = 0;
let stats = {};
let dropSchedule = [], superSchedule = [];
let shake = 0, fovKick = 0, slowmo = 1;
let best = parseInt(store.get('dd_best', '0'), 10) || 0;
let lastSec = -1;

function addScore(pts, x, y, z, label, color, big) {
  score += pts;
  popup(`${label ? label + ' ' : ''}+${fmt(pts)}`, x, y, z, color, big);
}

function loseCombo(x, y, z) {
  if (combo > 1) popup('combo lost', x, y + 1, z, '#ff9b9b');
  combo = 1; comboT = 0;
}

function resetCar() {
  Object.assign(car, { x: SPAWN.x, z: SPAWN.z, y: 0, vx: 0, vz: 0, vy: 0, th: SPAWN.th, grounded: true, drifting: false, driftT: 0, driftLvl: 0, boostT: 0, airT: 0, pitch: 0, roll: 0, steerS: 0, squash: 0, driftVis: 0, prevWheels: null });
}

function startGame() {
  sound.init();
  hideAllScreens();
  $('hud').classList.remove('hidden');
  $('btn-pause').classList.remove('hidden');
  refreshTouch(true);
  clearPopups(); clearSkids(); smoke.clear(); sparks.clear();
  resetCar();
  while (ducks.length) removeDuck(ducks[0]);
  AIR_SLOTS.forEach((s) => (s.used = false));
  stars.forEach(hideStar); hideStar(superStar);
  stars.forEach(placeStar);
  spawnWalkingDuck();
  score = 0; shownScore = 0; combo = 1; comboT = 0; timeLeft = GAME_TIME; elapsed = 0;
  stats = { stars: 0, bestCombo: 1, ducks: 0, bestAir: 0, supers: 0 };
  dropSchedule = [9, 20, 31, 42];
  superSchedule = [12, 26, 40, 52];
  countdownT = 3.5; lastSec = -1; slowmo = 1;
  mode = 'countdown';
  snapCamera();
  sound.setMusic(0.12);
  $('hud-time').classList.remove('warn');
}

function finishGame() {
  mode = 'finish';
  finishT = 1.8;
  centerText('TIME!', 1.6, '#ff4d4d');
  sound.beep(true);
}

function showResults() {
  mode = 'results';
  $('hud').classList.add('hidden');
  $('btn-pause').classList.add('hidden');
  refreshTouch();
  const newBest = score > best;
  if (newBest) { best = score; store.set('dd_best', String(best)); }
  const rank = score >= 16000 ? 'S' : score >= 10000 ? 'A' : score >= 5500 ? 'B' : score >= 2500 ? 'C' : 'D';
  const titles = { S: 'Desk legend!', A: 'Super driver!', B: 'Nice driving!', C: 'Getting there!', D: 'Keep practising!' };
  $('res-rank').textContent = rank;
  $('res-title').textContent = titles[rank];
  $('res-score').textContent = fmt(score);
  $('res-stars').textContent = stats.stars;
  $('res-combo').textContent = 'x' + stats.bestCombo;
  $('res-ducks').textContent = stats.ducks;
  $('res-air').textContent = stats.bestAir.toFixed(1) + 's';
  $('res-best').textContent = 'Best: ' + fmt(best);
  $('res-newbest').classList.toggle('hidden', !newBest);
  $('results').classList.remove('hidden');
  sound.fanfare();
  sound.setMusic(0.06);
  if (newBest) for (let i = 0; i < 6; i++) setTimeout(() => burst(car.x, car.y + 2, car.z, [0xff4d4d, 0xffd23f, 0x3fa7ff, 0x3ddc84, 0xff7eb6][i % 5], 30, 12, 1.2, 0.5, 10), i * 140);
}

function pauseGame() {
  if (mode !== 'playing' && mode !== 'countdown') return;
  pausedFrom = mode; mode = 'paused';
  $('pause').classList.remove('hidden');
  sound.engine(0, false, false); sound.skidLevel(0);
  sound.setMusic(0.04);
}
function resumeGame() {
  if (mode !== 'paused') return;
  mode = pausedFrom;
  $('pause').classList.add('hidden');
  sound.setMusic(0.12);
}

function showTitle() {
  hideAllScreens();
  mode = 'title';
  $('title').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('btn-pause').classList.add('hidden');
  $('title-best').textContent = best ? `Best score: ${fmt(best)}` : '';
  refreshTouch();
  resetCar();
  clearPopups();
  if (!ducks.length) { spawnWalkingDuck(); spawnWalkingDuck(); }
  if (!stars.some((s) => s.active)) stars.forEach(placeStar);
  sound.setMusic(0.07);
  sound.engine(0, false, false); sound.skidLevel(0);
}

function hideAllScreens() {
  ['loading', 'title', 'showcase', 'pause', 'results'].forEach((id) => $(id).classList.add('hidden'));
}

function refreshTouch(force) {
  const show = usingTouch && (force || mode === 'playing' || mode === 'countdown');
  $('touch').classList.toggle('hidden', !show);
}

function toggleMute() {
  sound.init();
  sound.setMuted(!sound.muted);
  $('btn-mute').textContent = sound.muted ? '🔇' : '🔊';
}

// ---------------------------------------------------------------- car update
const _f = [0, 1], _r = [-1, 0];
function carFwd() { _f[0] = Math.sin(car.th); _f[1] = Math.cos(car.th); _r[0] = -Math.cos(car.th); _r[1] = Math.sin(car.th); }

function updateCar(dt, inp, canDrive) {
  const c = car;
  carFwd();
  const f0 = _f[0], f1 = _f[1], r0 = _r[0], r1 = _r[1];
  let vf = c.vx * f0 + c.vz * f1;
  let vl = c.vx * r0 + c.vz * r1;
  const thr = canDrive ? inp.throttle : 0, brk = canDrive ? inp.brake : 0, steer = canDrive ? inp.steer : 0;
  c.steerS = damp(c.steerS, steer, 12, dt);
  const boosting = c.boostT > 0;
  if (boosting) c.boostT -= dt;
  const maxV = boosting ? MAXB : MAXV;
  const prevVf = vf;

  if (c.grounded) {
    // start / end drift
    if (canDrive && inp.drift && !c.drifting && Math.abs(steer) > 0.3 && vf > 7) {
      c.drifting = true; c.driftDir = Math.sign(steer); c.driftT = 0; c.driftLvl = 0; c.hop = 1;
      sound.whoosh();
    }
    if (c.drifting && (!inp.drift || vf < 4 || !canDrive)) {
      const lvl = c.driftLvl;
      if (lvl > 0 && canDrive) {
        c.boostT = [0, 0.7, 1.1, 1.6][lvl]; c.boostLvl = lvl;
        sound.boost(lvl);
        popup(['', 'TURBO!', 'SUPER TURBO!', 'ULTRA TURBO!'][lvl], c.x, c.y + 2.2, c.z, ['', '#7cc8ff', '#ffb347', '#d58cff'][lvl]);
        fovKick = 6 + lvl * 3;
        shake = Math.max(shake, 0.15 + lvl * 0.08);
      }
      c.drifting = false;
    }
    if (c.drifting) {
      c.driftT += dt * (0.75 + 0.55 * Math.max(0, steer * c.driftDir));
      const lvl = c.driftT > 2.3 ? 3 : c.driftT > 1.4 ? 2 : c.driftT > 0.65 ? 1 : 0;
      if (lvl > c.driftLvl) { c.driftLvl = lvl; sound.charge(lvl); }
    }

    if (boosting) { if (vf < maxV) vf = Math.min(maxV, vf + ACC * 1.7 * dt); }
    else if (thr > 0 && vf < maxV) vf = Math.min(maxV, vf + ACC * thr * dt * (vf < 0 ? 2 : 1) * (vf > 12 ? 0.75 : 1));
    if (brk > 0) { if (vf > 0.5) vf -= BRAKE * dt; else vf -= REV_ACC * dt; }
    if (!thr && !brk && !boosting) vf -= vf * 1.1 * dt;
    if (inp.drift && !c.drifting && canDrive) vf -= vf * 1.4 * dt;
    if (vf > maxV) vf = damp(vf, maxV, 3, dt);
    if (vf < -MAXREV) vf = -MAXREV;

    const grip = c.drifting ? 2.2 : inp.drift && canDrive ? 3 : 10;
    vl *= Math.exp(-grip * dt);

    let st = c.steerS;
    if (c.drifting) st = c.driftDir * 0.72 + steer * 0.42;
    const sp = clamp(vf / 6, -1, 1);
    const hi = 1 - 0.3 * clamp(Math.abs(vf) / MAXV, 0, 1);
    c.th -= st * TURN * sp * hi * (c.drifting ? 1.15 : 1) * dt;
  } else {
    c.th -= c.steerS * TURN * 0.35 * dt;
    if (c.drifting) c.drifting = false;
  }
  c.accelVis = damp(c.accelVis, (vf - prevVf) / Math.max(dt, 1e-4), 6, dt);

  c.vx = f0 * vf + r0 * vl;
  c.vz = f1 * vf + r1 * vl;
  c.x += c.vx * dt;
  c.z += c.vz * dt;

  // walls
  const imp = Math.max(collideSolids(c, CAR_R, 1.4), collidePencils(c, CAR_R, 1.4));
  if (imp > 4) {
    sound.bump(imp / 20);
    shake = Math.max(shake, Math.min(imp / 40, 0.5));
    burst(c.x, c.y + 0.6, c.z, 0xffffff, 8, 5, 0.35, 0.4, 4);
    if (imp > 12) popup('BONK', c.x, c.y + 2, c.z, '#ffd23f');
  }

  // vertical
  const gh = groundAt(c.x, c.z, c.y);
  if (c.grounded) {
    if (gh > -1e9 && gh >= c.y - 0.6) {
      c.vy = clamp((gh - c.y) / dt, -20, 14);
      c.y = gh;
    } else {
      c.grounded = false; c.airT = 0;
      if (c.vy < 0) c.vy = 0;
      if (gh < -1e9) c.vy = Math.min(c.vy, 2);
    }
  } else {
    c.vy -= GRAV * dt;
    c.y += c.vy * dt;
    c.airT += dt;
    if (c.y <= gh) {
      const impact = -c.vy;
      c.y = gh; c.vy = 0; c.grounded = true;
      c.squash = clamp(impact / 40, 0.05, 0.3);
      if (impact > 6) {
        sound.land(impact / 20);
        puffRing(c.x, c.y, c.z, 8, 4, 0.8);
        shake = Math.max(shake, Math.min(impact / 60, 0.35));
      }
      if (mode === 'playing' && c.airT > 0.55) {
        const pts = Math.round(c.airT * 50) * 10;
        addScore(pts, c.x, c.y + 2.4, c.z, 'BIG AIR', '#7cc8ff');
        sound.bonus();
        stats.bestAir = Math.max(stats.bestAir, c.airT);
      }
    }
  }

  // fell off the desk
  if (c.y < -16) {
    if (mode === 'playing') {
      timeLeft = Math.max(0, timeLeft - 3);
      centerText('-3s', 0.9, '#ff4d4d');
      loseCombo(SPAWN.x, 0, SPAWN.z);
    }
    resetCar();
    c.invuln = 1.6;
    puffRing(c.x, 0, c.z, 12, 5, 1.2);
    sound.land(1);
  }
  if (c.y < -1 && c.vy < -8 && !c.fallSound) { sound.fall(); c.fallSound = true; }
  if (c.y >= 0) c.fallSound = false;
  if (c.invuln > 0) c.invuln -= dt;

  c.speed = Math.hypot(c.vx, c.vz);

  // ------- effects
  const rearX = c.x - f0 * 0.95, rearZ = c.z - f1 * 0.95;
  const wl = [rearX + r0 * 0.6, rearZ + r1 * 0.6], wr = [rearX - r0 * 0.6, rearZ - r1 * 0.6];
  const slip = Math.abs(vl);
  const skidding = c.grounded && (c.drifting || slip > 3.5 || (brk && vf > 6));
  if (skidding && c.y < 0.06) {
    if (c.prevWheels) {
      const a = c.drifting ? 0.32 : 0.22;
      skidLine(c.prevWheels[0], c.prevWheels[1], wl[0], wl[1], 0.32, a);
      skidLine(c.prevWheels[2], c.prevWheels[3], wr[0], wr[1], 0.32, a);
    }
    c.prevWheels = [wl[0], wl[1], wr[0], wr[1]];
  } else c.prevWheels = null;

  if (skidding && Math.random() < 0.6) {
    const w = Math.random() < 0.5 ? wl : wr;
    smoke.spawn(w[0], c.y + 0.25, w[1], rand(-1, 1) - c.vx * 0.1, rand(0.6, 1.4), rand(-1, 1) - c.vz * 0.1, rand(0.5, 0.9), 0.6, 2.2, 0xffffff, -0.5, 2, 0.55);
  }
  if (c.drifting && c.driftLvl > 0) {
    const col = [0, 0x5ab8ff, 0xffa53d, 0xc77dff][c.driftLvl];
    for (const w of [wl, wr]) sparks.spawn(w[0], c.y + 0.25, w[1], rand(-3, 3) - f0 * 3, rand(2, 5), rand(-3, 3) - f1 * 3, 0.3, 0.45, 0.1, col, 14, 1);
  }
  if (c.boostT > 0) {
    const col = [0xffffff, 0x8fd3ff, 0xffb347, 0xd58cff][c.boostLvl];
    for (let i = 0; i < 2; i++) sparks.spawn(c.x - f0 * 1.3 + rand(-0.2, 0.2), c.y + 0.55, c.z - f1 * 1.3 + rand(-0.2, 0.2), -f0 * 8 + rand(-1, 1), rand(0, 1), -f1 * 8 + rand(-1, 1), 0.28, 0.9, 0.2, col, 0, 2);
  }
  if (mode === 'playing' || mode === 'countdown') {
    sound.engine(clamp(c.speed / MAXB, 0, 1), c.boostT > 0, true);
    sound.skidLevel(skidding ? clamp(slip / 8 + (c.drifting ? 0.5 : 0), 0, 1) : 0);
  }
}

function updateCarVisual(dt) {
  const c = car;
  carFwd();
  carG.position.set(c.x, c.y, c.z);
  carG.rotation.y = c.th;
  let tp;
  if (c.grounded) {
    const hF = groundAt(c.x + _f[0] * 1.1, c.z + _f[1] * 1.1, c.y + 0.5);
    const hB = groundAt(c.x - _f[0] * 1.1, c.z - _f[1] * 1.1, c.y + 0.5);
    tp = (hF > -1e9 && hB > -1e9) ? -Math.atan2(hF - hB, 2.2) : 0;
    tp += clamp(-c.accelVis * 0.004, -0.06, 0.06);
  } else tp = clamp(-c.vy * 0.025, -0.45, 0.35);
  c.pitch = damp(c.pitch, tp, 10, dt);
  const rollT = c.grounded ? -c.steerS * clamp(c.speed / MAXV, 0, 1) * 0.09 : 0;
  c.roll = damp(c.roll, rollT, 8, dt);
  c.driftVis = damp(c.driftVis, c.drifting ? c.driftDir * 0.38 : 0, 7, dt);
  c.squash = damp(c.squash, 0, 7, dt);
  c.hop = damp(c.hop, 0, 9, dt);
  carPivot.rotation.set(c.pitch, -c.driftVis, c.roll);
  carPivot.position.y = c.hop * 0.3 + (c.grounded && c.speed > 2 ? Math.sin(performance.now() * 0.03) * 0.015 : 0);
  carPivot.scale.set(1 + c.squash * 0.5, 1 - c.squash, 1 + c.squash * 0.5);
  carG.visible = c.invuln <= 0 || Math.floor(c.invuln * 12) % 2 === 0;
}

// ---------------------------------------------------------------- ducks
function updateDucks(dt) {
  const playing = mode === 'playing';
  const late = playing && timeLeft < 20;
  for (let i = ducks.length - 1; i >= 0; i--) {
    const d = ducks[i];
    d.t += dt;
    if (d.state === 'drop') {
      d.vy -= 55 * dt;
      d.y += d.vy * dt;
      const k = 1 - clamp(d.y / 34, 0, 1);
      d.ring.scale.setScalar(lerp(1.6, 1, k) * (1 + Math.sin(d.t * 18) * 0.06));
      d.ring.material.opacity = 0.35 + k * 0.55;
      if (d.y <= 0) {
        d.y = 0; d.vy = 0; d.state = 'walk'; d.squash = 0.55;
        d.ring.visible = false;
        const dist = Math.hypot(car.x - d.x, car.z - d.z);
        const prox = clamp(1 - dist / 30, 0.1, 1);
        sound.thud(prox);
        shake = Math.max(shake, prox * 0.7);
        puffRing(d.x, 0, d.z, 14, 7, 1.6);
        if (dist < DUCK_R + CAR_R * 0.6 && car.y < 2.5 && car.invuln <= 0) {
          const nx = (car.x - d.x) / (dist || 1), nz = (car.z - d.z) / (dist || 1);
          car.vx = nx * 16; car.vz = nz * 16; car.vy = 10; car.y += 0.1; car.grounded = false;
          car.squash = 0.4;
          sound.quack();
          popup('SQUASHED!', car.x, car.y + 2.5, car.z, '#ff4d4d', true);
          if (playing) loseCombo(car.x, car.y, car.z);
        }
      }
    } else if (d.state === 'walk') {
      if (d.hitT > 0) {
        d.hitT -= dt;
        const fr = Math.exp(-0.9 * dt);
        d.vx *= fr; d.vz *= fr;
      } else {
        d.retarget -= dt;
        let tx = d.tx, tz = d.tz;
        if (late && d.chaser) { tx = car.x; tz = car.z; }
        else if (d.retarget <= 0 || Math.hypot(tx - d.x, tz - d.z) < 2) {
          const p = duckSpot(false); d.tx = p[0]; d.tz = p[1]; d.retarget = rand(4, 7);
          tx = d.tx; tz = d.tz;
        }
        const spd = (late ? 6.5 : 3.2) + (playing ? elapsed * 0.03 : 0);
        const dx = tx - d.x, dz = tz - d.z, dl = Math.hypot(dx, dz) || 1;
        let ax = (dx / dl) * spd, az = (dz / dl) * spd;
        // stay away from the edge on their own
        const ex = HALF_W - 4 - Math.abs(d.x), ez = HALF_D - 4 - Math.abs(d.z);
        if (ex < 0) ax -= Math.sign(d.x) * spd * 2;
        if (ez < 0) az -= Math.sign(d.z) * spd * 2;
        d.vx = damp(d.vx, ax, 1.8, dt);
        d.vz = damp(d.vz, az, 1.8, dt);
      }
      d.x += d.vx * dt; d.z += d.vz * dt;
      const e = d;
      const wasY = e.y; e.y = Math.max(e.y, 0);
      collideSolids(e, DUCK_R, 1.3);
      collidePencils(e, DUCK_R, 1.3);
      e.y = wasY;
      // vertical (ducks can be knocked into the air and off the desk)
      const gh = onDesk(d.x, d.z) ? 0 : -Infinity;
      if (d.y > gh || d.vy > 0) {
        d.vy -= GRAV * dt; d.y += d.vy * dt;
        if (d.y <= gh) { if (d.vy < -6) { d.squash = 0.35; sound.thud(0.3); } d.y = gh; d.vy = 0; }
      }
      if (d.y < -1.5) {
        d.state = 'fall';
        d.spin = rand(-6, 6);
        if (playing && elapsed - d.lastHit < 5) {
          stats.ducks++;
          addScore(1000, d.x, 2, d.z, 'DUCK OFF!', '#ffd23f', true);
          sound.bonus(); sound.quack();
          dropSchedule.push(elapsed + 3);
        }
      }
    } else if (d.state === 'fall') {
      d.vy -= GRAV * dt; d.y += d.vy * dt;
      d.x += d.vx * dt; d.z += d.vz * dt;
      d.inner.rotation.x += d.spin * dt;
      if (d.y < -45) { removeDuck(d); continue; }
    }

    // visuals
    const spd = Math.hypot(d.vx, d.vz);
    if (spd > 0.4 && d.hitT <= 0) d.yaw += angDiff(d.yaw, Math.atan2(d.vx, d.vz)) * Math.min(1, dt * 5);
    if (d.hitT > 0) d.yaw += spd * 0.15 * dt * 10;
    d.squash = damp(d.squash, 0, 6, dt);
    const w = clamp(spd / 3, 0, 1);
    d.g.position.set(d.x, d.y, d.z);
    d.g.rotation.y = d.yaw;
    if (d.state !== 'fall') {
      d.inner.rotation.z = Math.sin(d.t * 8) * 0.13 * w;
      d.inner.position.y = Math.abs(Math.sin(d.t * 8)) * 0.25 * w;
    }
    const sq = d.squash * Math.cos(d.t * 25) * 0.9 + d.squash;
    d.inner.scale.set(1 + sq * 0.4, 1 - sq * 0.6, 1 + sq * 0.4);
  }

  // duck vs duck
  for (let i = 0; i < ducks.length; i++) for (let j = i + 1; j < ducks.length; j++) {
    const a = ducks[i], b = ducks[j];
    if (a.state !== 'walk' || b.state !== 'walk') continue;
    const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), m = DUCK_R * 2;
    if (dist >= m || dist < 1e-4) continue;
    const nx = dx / dist, nz = dz / dist, pen = (m - dist) / 2;
    a.x -= nx * pen; a.z -= nz * pen; b.x += nx * pen; b.z += nz * pen;
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) {
      const j = -1.6 * rv / 2;
      a.vx -= j * nx; a.vz -= j * nz; b.vx += j * nx; b.vz += j * nz;
      if (-rv > 6) { b.hitT = Math.max(b.hitT, 0.8); a.hitT = Math.max(a.hitT, 0.8); b.lastHit = Math.max(b.lastHit, a.lastHit); a.lastHit = b.lastHit; sound.quack(); }
    }
  }

  // car vs duck
  if (car.invuln > 0) return;
  for (const d of ducks) {
    if (d.state !== 'walk' || car.y > d.y + 3.4) continue;
    const dx = car.x - d.x, dz = car.z - d.z, dist = Math.hypot(dx, dz), m = CAR_R + DUCK_R;
    if (dist >= m || dist < 1e-4) continue;
    const nx = dx / dist, nz = dz / dist;
    const pen = m - dist, im = 1 / (1 + 1 / DUCK_MASS);
    car.x += nx * pen * (1 - im); car.z += nz * pen * (1 - im);
    d.x -= nx * pen * im; d.z -= nz * pen * im;
    const rv = (car.vx - d.vx) * nx + (car.vz - d.vz) * nz;
    if (rv >= 0) continue;
    const j = -1.55 * rv / (1 + 1 / DUCK_MASS);
    car.vx += j * nx; car.vz += j * nz;
    d.vx -= (j * nx) / DUCK_MASS; d.vz -= (j * nz) / DUCK_MASS;
    const impact = -rv;
    if (impact < 2.5) continue;
    d.hitT = 1.4; d.lastHit = elapsed; d.squash = 0.3;
    sound.quack();
    const hx = d.x, hz = d.z;
    if (impact >= 12 || car.boostT > 0) {
      d.vy = clamp(impact * 0.45, 3, 11);
      shake = Math.max(shake, 0.45);
      burst(hx + nx * DUCK_R, 1.6, hz + nz * DUCK_R, 0xffd23f, 24, 10, 0.55, 0.55, 10);
      popup('BONK!', hx, 4.8, hz, '#ffd23f', true);
      if (mode === 'playing') addScore(150, hx, 3.5, hz, '', '#fff');
    } else {
      shake = Math.max(shake, 0.25);
      popup('QUACK!', hx, 4.8, hz, '#ffb347');
      if (mode === 'playing') loseCombo(car.x, car.y, car.z);
    }
  }
}

// ---------------------------------------------------------------- stars
function updateStars(dt) {
  const all = superStar ? [...stars, superStar] : stars;
  for (const st of all) {
    st.t += dt;
    if (!st.active) {
      if (st.respawnT > 0 && !st.isSuper) { st.respawnT -= dt; if (st.respawnT <= 0) placeStar(st); }
      continue;
    }
    st.spawnT = Math.min(1, st.spawnT + dt * 2.5);
    const s = st.spawnT;
    const pop = s < 1 ? 1 + Math.sin(s * Math.PI) * 0.35 : 1;
    const base = st.isSuper ? 1.45 : 1;
    st.o.scale.setScalar(base * s * pop);
    const y = st.y + Math.sin(st.t * 3) * 0.22;
    st.o.position.set(st.x, y, st.z);
    st.o.rotation.y = st.t * 2.4;
    st.glow.position.set(st.x, y + 0.75 * base, st.z);
    st.glow.material.opacity = (0.45 + Math.sin(st.t * 5) * 0.12) * s;
    if (st.isSuper) {
      st.life -= dt;
      const blink = st.life < 2.5 && Math.floor(st.life * 8) % 2 === 0;
      st.o.visible = !blink; st.glow.visible = !blink;
      if (st.life <= 0) { hideStar(st); continue; }
    }
    if (mode !== 'playing' && mode !== 'finish') continue;
    if (mode === 'finish') continue;
    const cy = car.y + 0.6, sy = y + 0.75 * base;
    const reach = st.isSuper ? 2.4 : 1.8;
    if (Math.hypot(car.x - st.x, car.z - st.z) < reach && Math.abs(cy - sy) < 1.9) collectStar(st, sy);
  }
}

function collectStar(st, sy) {
  if (comboT > 0) combo = Math.min(combo + 1, 10); else combo = 1;
  comboT = COMBO_WINDOW;
  stats.bestCombo = Math.max(stats.bestCombo, combo);
  const pts = (st.isSuper ? 500 : 100) * combo;
  if (st.isSuper) {
    timeLeft += 4;
    stats.supers++;
    addScore(pts, st.x, sy + 1.2, st.z, '+4s', '#ff7eb6', true);
    sound.superStar();
    burst(st.x, sy, st.z, 0xff7eb6, 40, 12, 0.8, 0.7);
  } else {
    stats.stars++;
    addScore(pts, st.x, sy + 1, st.z, combo > 1 ? `x${combo}` : '', combo >= 5 ? '#ffd23f' : '#fff', combo >= 5);
    sound.star(combo);
    burst(st.x, sy, st.z, 0xffd23f, 22, 9, 0.6, 0.55);
    st.respawnT = 0.35;
  }
  burst(st.x, sy, st.z, 0xffffff, 8, 5, 0.4, 0.8, 0);
  hideStar(st);
}

// ---------------------------------------------------------------- camera
const camState = { yaw: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 62, t: 0 };
function snapCamera() {
  camState.yaw = car.th;
  const f = [Math.sin(car.th), Math.cos(car.th)];
  camState.pos.set(car.x - f[0] * 8, car.y + 3.6, car.z - f[1] * 8);
  camState.look.set(car.x + f[0] * 3, car.y + 1, car.z + f[1] * 3);
}

function updateCamera(dt) {
  if (window.__camOverride) return;
  camState.t += dt;
  if (mode === 'title' || mode === 'loading') {
    const a = camState.t * 0.08 + 2.6;
    const r = innerWidth < innerHeight ? 62 : 46;
    camera.position.set(Math.sin(a) * r, 26 + Math.sin(camState.t * 0.2) * 3, Math.cos(a) * r);
    camera.lookAt(0, -2, 0);
    camera.fov = damp(camera.fov, 55, 3, dt);
    camera.updateProjectionMatrix();
    return;
  }
  // chase cam: follow the velocity direction a bit while drifting so the slide is visible
  let targetYaw = car.th;
  if (car.speed > 4) {
    const vy = Math.atan2(car.vx, car.vz);
    if (Math.abs(angDiff(car.th, vy)) < 1.4) targetYaw = car.th + angDiff(car.th, vy) * 0.55;
  }
  camState.yaw += angDiff(camState.yaw, targetYaw) * Math.min(1, dt * 4.5);
  const fx = Math.sin(camState.yaw), fz = Math.cos(camState.yaw);
  const portrait = innerWidth < innerHeight;
  const dist = (portrait ? 10.5 : 7.8) + car.speed * 0.07;
  const h = (portrait ? 4.6 : 3.4) + car.speed * 0.03;
  const cy = Math.max(car.y, -1.5);
  const want = new THREE.Vector3(car.x - fx * dist, Math.max(cy + h, 2.2), car.z - fz * dist);
  if (car.y < -1.5) want.y = 5;
  camState.pos.x = damp(camState.pos.x, want.x, 6, dt);
  camState.pos.y = damp(camState.pos.y, want.y, 4, dt);
  camState.pos.z = damp(camState.pos.z, want.z, 6, dt);
  const lookY = car.y < -1.5 ? car.y * 0.6 : cy + 1.1;
  camState.look.x = damp(camState.look.x, car.x + fx * 3.5, 10, dt);
  camState.look.y = damp(camState.look.y, lookY, 8, dt);
  camState.look.z = damp(camState.look.z, car.z + fz * 3.5, 10, dt);
  shake = damp(shake, 0, 5, dt);
  fovKick = damp(fovKick, 0, 2.5, dt);
  camera.position.copy(camState.pos);
  if (shake > 0.002) camera.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake));
  camera.lookAt(camState.look);
  const fovT = (portrait ? 70 : 60) + car.speed * 0.25 + (car.boostT > 0 ? 8 : 0) + fovKick;
  camera.fov = damp(camera.fov, fovT, 5, dt);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- HUD
const hud = { score: $('score'), time: $('time'), combo: $('combo'), comboBar: $('combo-bar'), comboBox: $('hud-combo'), timeBox: $('hud-time'), drift: $('drift-fill'), driftLbl: $('drift-lbl') };
function updateHUD(dt) {
  shownScore = damp(shownScore, score, 10, dt);
  if (Math.abs(shownScore - score) < 1) shownScore = score;
  hud.score.textContent = fmt(shownScore);
  const t = Math.max(0, Math.ceil(timeLeft));
  hud.time.textContent = t;
  hud.timeBox.classList.toggle('warn', timeLeft <= 10 && mode === 'playing');
  if (mode === 'playing' && timeLeft <= 5 && t !== lastSec && t > 0) { lastSec = t; sound.beep(false); }
  hud.combo.textContent = 'x' + combo;
  hud.comboBar.style.width = (comboT / COMBO_WINDOW) * 100 + '%';
  hud.comboBox.classList.toggle('hot', combo >= 5);
  const lvlCol = ['#cfd8e3', '#5ab8ff', '#ffa53d', '#c77dff'];
  if (car.boostT > 0) {
    hud.drift.style.width = '100%'; hud.drift.style.background = lvlCol[car.boostLvl] || '#ffd23f'; hud.driftLbl.textContent = 'TURBO!';
  } else if (car.drifting) {
    hud.drift.style.width = clamp(car.driftT / 2.3, 0, 1) * 100 + '%';
    hud.drift.style.background = lvlCol[car.driftLvl] === '#cfd8e3' ? '#9fb3c8' : lvlCol[car.driftLvl];
    hud.driftLbl.textContent = ['DRIFTING…', 'TURBO', 'SUPER TURBO', 'ULTRA TURBO'][car.driftLvl];
  } else {
    hud.drift.style.width = '0%';
    hud.driftLbl.textContent = usingTouch ? 'DRIFT + STEER' : 'SPACE + STEER = DRIFT';
  }
  $('speedlines').style.opacity = car.boostT > 0 ? 1 : 0;
}

// ---------------------------------------------------------------- showcase (model viewer)
const sc = {
  scene: new THREE.Scene(),
  cam: new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100),
  items: [], idx: 0, rot: 0, vel: 0.6, drag: null, t: 0, pop: 1,
};
function buildShowcase() {
  sc.scene.background = gradientBg('#fff1d6', '#ffd6a0');
  sc.scene.environment = envTex;
  sc.scene.environmentIntensity = 0.7;
  sc.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a7a5a, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4, 8, 6); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
  sc.scene.add(key);
  const rim = new THREE.DirectionalLight(0xa9cfff, 1.2);
  rim.position.set(-6, 4, -6);
  sc.scene.add(rim);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.5, 64), new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.6 }));
  ped.position.y = -0.25; ped.receiveShadow = true;
  sc.scene.add(ped);
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.06, 8, 64), new THREE.MeshStandardMaterial({ color: 0x1e1b2e }));
  rimRing.rotation.x = Math.PI / 2; rimRing.position.y = 0.0;
  sc.scene.add(rimRing);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.ShadowMaterial({ opacity: 0.15 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.5; floor.receiveShadow = true;
  sc.scene.add(floor);

  for (const k of ['car', 'pencil', 'duck', 'star']) {
    const o = proto[k].clone();
    const dims = modelStats[k].dims;
    const s = (k === 'pencil' ? 4.2 : 3.0) / Math.max(dims.x, dims.y, dims.z);
    const holder = new THREE.Group();
    o.scale.setScalar(s);
    if (k === 'pencil') { o.rotation.y = Math.PI / 2; }
    holder.add(o);
    holder.visible = false;
    sc.scene.add(holder);
    sc.items.push({ key: k, holder, base: s });
  }
  sc.cam.position.set(0, 2.6, 8.2);
  sc.cam.lookAt(0, 1.1, 0);

  canvas.addEventListener('pointerdown', (e) => { if (mode === 'showcase') { sc.drag = { x: e.clientX, t: performance.now() }; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'showcase' || !sc.drag) return;
    const dx = e.clientX - sc.drag.x;
    sc.rot += dx * 0.01;
    sc.vel = dx * 0.6;
    sc.drag.x = e.clientX;
  });
  const end = () => { sc.drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

function openShowcase() {
  hideAllScreens();
  mode = 'showcase';
  $('hud').classList.add('hidden'); $('btn-pause').classList.add('hidden'); $('touch').classList.add('hidden');
  $('showcase').classList.remove('hidden');
  showcaseGo(0);
}

function showcaseGo(dir) {
  sc.idx = (sc.idx + dir + sc.items.length) % sc.items.length;
  sc.items.forEach((it, i) => (it.holder.visible = i === sc.idx));
  sc.pop = 0;
  const it = sc.items[sc.idx];
  const m = MODELS[it.key], st = modelStats[it.key];
  $('sc-count').textContent = `${sc.idx + 1} / ${sc.items.length}`;
  $('sc-name').textContent = m.name;
  $('sc-role').textContent = m.role;
  $('sc-tris').textContent = fmt(st.tris);
  $('sc-size').textContent = (st.bytes / 1048576).toFixed(1);
  if (dir) sound.click();
}

function updateShowcase(dt) {
  sc.t += dt;
  if (!sc.drag) { sc.vel = damp(sc.vel, 0.6, 2, dt); sc.rot += sc.vel * dt; }
  sc.pop = Math.min(1, sc.pop + dt * 3);
  const it = sc.items[sc.idx];
  const p = sc.pop;
  const k = p < 1 ? 1 + Math.sin(p * Math.PI) * 0.18 : 1;
  it.holder.scale.setScalar(p * k);
  it.holder.rotation.y = sc.rot;
  it.holder.position.y = it.key === 'star' ? 0.3 + Math.sin(sc.t * 2) * 0.1 : 0;
  const portrait = innerWidth < innerHeight;
  sc.cam.position.set(0, portrait ? 3.6 : 3.4, portrait ? 11 : 10.5);
  sc.cam.lookAt(0, portrait ? -0.9 : 0.1, 0);
}

// ---------------------------------------------------------------- main loop
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - lastT) / 1000, 1 / 30);
  lastT = now;
  if (mode === 'loading') { renderer.render(scene, camera); return; }
  if (mode === 'showcase') {
    updateShowcase(dt);
    renderer.render(sc.scene, sc.cam);
    return;
  }
  if (mode === 'paused') { renderer.render(scene, camera); return; }
  tick(dt);
  renderer.render(scene, camera);
}

let testInput = null; // used by automated tests only
function tick(dt) {
  if (mode === 'finish') { slowmo = damp(slowmo, 0.25, 4, dt); dt *= slowmo; }

  const inp = testInput || getInput();
  if (mode === 'countdown') {
    countdownT -= dt;
    const n = Math.ceil(countdownT - 0.5);
    if (n !== lastSec) {
      lastSec = n;
      if (n > 0 && n <= 3) { centerText(String(n), 0.8); sound.beep(false); }
      if (n === 0) { centerText('GO!', 0.8, '#3ddc84'); sound.beep(true); mode = 'playing'; lastSec = -1; }
    }
    updateCar(dt, inp, false);
  } else if (mode === 'playing') {
    timeLeft -= dt; elapsed += dt;
    if (comboT > 0) { comboT -= dt; if (comboT <= 0) { comboT = 0; combo = 1; } }
    while (dropSchedule.length && elapsed >= dropSchedule[0]) {
      dropSchedule.shift();
      if (ducks.filter((d) => d.state !== 'fall').length < 6) {
        const d = dropDuck(Math.random() < 0.45);
        d.chaser = Math.random() < 0.5;
      }
      dropSchedule.sort((a, b) => a - b);
    }
    while (superSchedule.length && elapsed >= superSchedule[0]) {
      superSchedule.shift();
      if (!superStar.active) { placeStar(superStar); popup('★ PINK STAR = +4s ★', superStar.x, superStar.y + 3, superStar.z, '#ff7eb6', true); }
    }
    updateCar(dt, inp, true);
    if (timeLeft <= 0) { timeLeft = 0; finishGame(); }
  } else if (mode === 'finish') {
    updateCar(dt, { throttle: 0, brake: 0, steer: 0, drift: false }, false);
    finishT -= dt / Math.max(slowmo, 0.25);
    sound.engine(0, false, false); sound.skidLevel(0);
    if (finishT <= 0) showResults();
  } else if (mode === 'title' || mode === 'results') {
    car.vx = car.vz = 0;
    updateCar(dt, { throttle: 0, brake: 0, steer: 0, drift: false }, false);
  }

  updateCarVisual(dt);
  updateDucks(dt);
  updateStars(dt);
  smoke.update(dt);
  sparks.update(dt);
  updateCamera(dt);
  updatePopups(dt);
  if (mode === 'playing' || mode === 'countdown' || mode === 'finish') updateHUD(dt);
  if (centerTimer > 0) { centerTimer -= dt; if (centerTimer <= 0) centerEl.style.opacity = 0; }
  if (skidDirty) { skidTex.needsUpdate = true; skidDirty = false; }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  sc.cam.aspect = innerWidth / innerHeight; sc.cam.updateProjectionMatrix();
});

// ---------------------------------------------------------------- UI wiring
$('btn-play').onclick = () => startGame();
$('btn-showcase').onclick = () => { sound.click(); openShowcase(); };
$('sc-back').onclick = () => { sound.click(); showTitle(); };
$('sc-prev').onclick = () => showcaseGo(-1);
$('sc-next').onclick = () => showcaseGo(1);
$('btn-resume').onclick = () => resumeGame();
$('btn-restart').onclick = () => startGame();
$('btn-quit').onclick = () => showTitle();
$('btn-again').onclick = () => startGame();
$('btn-menu').onclick = () => showTitle();
$('btn-pause').onclick = () => pauseGame();
$('btn-mute').onclick = () => toggleMute();
$('btn-mute').textContent = sound.muted ? '🔇' : '🔊';
$('btn-share').onclick = async () => {
  const text = `I scored ${fmt(score)} in Doodle Dash 🏎️🦆 — a desk racer where every 3D model was generated with Vi3W. Can you beat it?`;
  const url = location.href.split('#')[0];
  try {
    if (navigator.share) await navigator.share({ title: 'Doodle Dash', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); $('btn-share').textContent = 'Copied!'; setTimeout(() => ($('btn-share').textContent = 'Share'), 1500); }
  } catch (e) {}
};

document.addEventListener('click', (e) => { if (e.target.closest('button')) e.target.closest('button').blur(); });

// ---------------------------------------------------------------- boot
async function boot() {
  requestAnimationFrame(frame);
  try { await document.fonts.load('40px "Permanent Marker"'); } catch (e) {}
  buildWorld();
  try {
    await loadModels((p) => {
      $('load-bar').style.width = Math.round(p * 100) + '%';
      $('load-msg').textContent = Math.round(p * 100) + '%';
    });
  } catch (err) {
    console.error(err);
    $('load-msg').textContent = 'Could not load the 3D models. If you opened index.html directly, run it from a local web server.';
    return;
  }
  setupEntities();
  buildShowcase();
  // pre-compile shaders so the first frame doesn't hitch
  renderer.compile(scene, camera);
  showTitle();
  if (location.hash === '#play') startGame();
  if (location.hash === '#showcase') openShowcase();
}
boot();

// debug handle for testing
window.__dd = {
  step(sec, inp) { testInput = inp ? { throttle: 0, brake: 0, steer: 0, drift: false, ...inp } : null; for (let t = 0; t < sec; t += 1 / 60) tick(1 / 60); testInput = null; },
  get score() { return score; }, get timeLeft() { return timeLeft; }, get stats() { return stats; }, get combo() { return combo; },
  sc, car, ducks, stars, get mode() { return mode; }, startGame, openShowcase, showTitle, FIX, camera };
