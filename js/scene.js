// Cena 3D do Formigueiro: o cenário de cada mundo (quintal de dia, debaixo da mangueira, caverna de
// cristal), o pedestal, o terrário de vidro (terra em camadas desenhada num canvas que muda quando a
// formiga cava), a formiguinha Tatá com a bomba nas costas, besouros, lagartas-de-fogo, chefes, pedras,
// frutinha, brasa, teia, letreiro do placar e partículas.
// Desempenho de Quest: sem sombras, sem pós-processamento, terra numa textura só, enfeites numa malha
// só, partículas num só Points.
import * as THREE from '../vendor/three/three.module.js';
import { CELL, TANK, DIRT, DUG, ROCK, ROOT, BOSS } from './sim.js';
import { W, H } from './levels.js';

export const PEDESTAL = { top: 0.86, z: -0.42 };
export const TANK_HOME = new THREE.Vector3(0, PEDESTAL.top + H * CELL / 2 + 0.03, PEDESTAL.z);

export const THEMES = [
  { // Quintal: céu azul, grama, cerca
    name: 'quintal', bg: '#9ad0f0', fog: '#b0dcf0', fogNear: 8, fogFar: 30, hemi: ['#ffffff', '#6a5030', 1.6], sun: ['#fff2d8', 1.5],
    layers: ['#c89a5a', '#a8743a', '#8a5a2c', '#6a3e1e'], tunnel: '#2a1608', solid: '#8a5a3a', glow: '#ffb43a',
    ground: ['#5aa040', '#4a8a34'], frame: '#a8743a',
  },
  { // Raízes da Mangueira: sombra da árvore, fim de tarde
    name: 'raizes', bg: '#e8a868', fog: '#d89a68', fogNear: 7, fogFar: 26, hemi: ['#ffe8c8', '#3a3018', 1.5], sun: ['#ffc888', 1.3],
    layers: ['#a8784a', '#8a5e34', '#6e4626', '#523018'], tunnel: '#1e1006', solid: '#7a5232', glow: '#ff8a3a',
    ground: ['#6a7a30', '#566424'], frame: '#6a4424',
  },
  { // Caverna de Cristal: pedra escura e cristais acesos
    name: 'caverna', bg: '#0a0e1e', fog: '#0e1428', fogNear: 6, fogFar: 22, hemi: ['#a8c0ff', '#1a1028', 1.5], sun: ['#c8b0ff', 1.0],
    layers: ['#9a88b0', '#8270a0', '#6c5a8e', '#584a7c'], tunnel: '#1c1630', solid: '#5ae8ff', glow: '#5ae8ff',
    ground: ['#2a2836', '#22202c'], frame: '#4a4a5a',
  },
];

// ---------- texturas ----------
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const rnd = (() => { let s = 777; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
function speckle(g, x0, y0, w, h, n, colors, rmax = 2) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.globalAlpha = 0.15 + rnd() * 0.3; g.beginPath(); g.arc(x0 + rnd() * w, y0 + rnd() * h, 0.6 + rnd() * rmax, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}
function glowTexture() {
  return canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}
function webTexture() {
  return canvasTex(128, 128, (g, w) => {
    g.strokeStyle = 'rgba(220,250,255,0.9)'; g.lineWidth = 2;
    const c = w / 2;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c); g.stroke(); }
    for (let r = 10; r < c; r += 11) { g.beginPath(); for (let k = 0; k <= 8; k++) { const a = k * Math.PI / 4; const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r; if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
  });
}
function groundTexture(th) {
  const [a, b] = th.ground;
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    if (th.name === 'caverna') { speckle(g, 0, 0, w, h, 2500, [b, '#3a3848', '#14121c'], 4); return; }
    speckle(g, 0, 0, w, h, 2000, [b, '#7ac050', '#3a6a24'], 2);
    g.strokeStyle = 'rgba(30,60,20,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 900; i++) { const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y - 6 - rnd() * 8); g.stroke(); }
    if (th.name === 'raizes') { g.fillStyle = 'rgba(40,30,10,0.35)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 30, 10 + rnd() * 14, rnd() * 3, 0, 7); g.fill(); } }
  }, [8, 8]);
}
function panoramaTexture(th) {
  return canvasTex(2048, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    if (th.name === 'quintal') { sky.addColorStop(0, '#5aa8e8'); sky.addColorStop(0.8, '#cfe8f8'); sky.addColorStop(1, '#e8f4e8'); }
    else if (th.name === 'raizes') { sky.addColorStop(0, '#e07a4a'); sky.addColorStop(0.6, '#ffc078'); sky.addColorStop(1, '#ffe0a8'); }
    else { sky.addColorStop(0, '#05060e'); sky.addColorStop(0.6, '#141430'); sky.addColorStop(1, '#22203a'); }
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    if (th.name === 'quintal') {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 8; i++) { const x = rnd() * w, y = 40 + rnd() * 120; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + k * 24, y + Math.sin(k) * 8, 18 + rnd() * 10, 0, 7); g.fill(); } }
      // casa, varal e cerca de madeira
      g.fillStyle = '#e8d8b8'; g.fillRect(w * 0.55, h * 0.45, 360, h * 0.4);
      g.fillStyle = '#c0503a'; g.beginPath(); g.moveTo(w * 0.55 - 20, h * 0.45); g.lineTo(w * 0.55 + 180, h * 0.25); g.lineTo(w * 0.55 + 380, h * 0.45); g.fill();
      g.fillStyle = '#7ab0d8'; g.fillRect(w * 0.55 + 60, h * 0.55, 60, 50); g.fillRect(w * 0.55 + 240, h * 0.55, 60, 50);
      g.strokeStyle = '#888'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.15, h * 0.5); g.lineTo(w * 0.35, h * 0.48); g.stroke();
      ['#ff6a6a', '#6ad0ff', '#ffe06a', '#ffffff'].forEach((c, i) => { g.fillStyle = c; g.fillRect(w * 0.17 + i * 70, h * 0.5 - i * 0.004 * h, 40, 50); });
      for (let x = 0; x < w; x += 34) { g.fillStyle = x % 68 ? '#b08050' : '#a07040'; g.fillRect(x, h * 0.72, 28, h * 0.28); g.beginPath(); g.moveTo(x, h * 0.72); g.lineTo(x + 14, h * 0.68); g.lineTo(x + 28, h * 0.72); g.fill(); }
      g.fillStyle = '#8a6038'; g.fillRect(0, h * 0.8, w, 8);
    } else if (th.name === 'raizes') {
      // a mangueira enorme: tronco, copa e mangas
      g.fillStyle = '#3a5a24';
      for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(rnd() * w, rnd() * h * 0.45, 60 + rnd() * 80, 0, 7); g.fill(); }
      g.fillStyle = '#5a3a1a'; g.fillRect(w * 0.45, h * 0.3, 160, h * 0.7);
      g.fillRect(w * 0.15, h * 0.4, 70, h * 0.6); g.fillRect(w * 0.8, h * 0.35, 90, h * 0.65);
      for (let i = 0; i < 50; i++) { g.fillStyle = rnd() < 0.5 ? '#ffa830' : '#e8c030'; g.beginPath(); g.ellipse(rnd() * w, h * 0.1 + rnd() * h * 0.35, 9, 12, 0.3, 0, 7); g.fill(); }
      g.strokeStyle = '#4a2e12'; g.lineWidth = 14;
      for (let i = 0; i < 14; i++) { const x = w * (0.4 + rnd() * 0.3); g.beginPath(); g.moveTo(x, h); g.bezierCurveTo(x - 80, h * 0.9, x - 150 + rnd() * 300, h * 0.95, x - 250 + rnd() * 500, h); g.stroke(); }
    } else {
      // paredes de pedra e cristais
      g.fillStyle = '#1a1828';
      for (let i = 0; i < 40; i++) { const x = rnd() * w; g.beginPath(); g.moveTo(x - 80, 0); g.lineTo(x, 80 + rnd() * 160); g.lineTo(x + 80, 0); g.fill(); }
      for (let i = 0; i < 70; i++) {
        const x = rnd() * w, y = h * (0.4 + rnd() * 0.6), s = 10 + rnd() * 36;
        const c = ['#5ae8ff', '#c08aff', '#ff7ad8', '#7affb0'][i % 4];
        g.fillStyle = c; g.globalAlpha = 0.75;
        g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x + s * 0.5, y); g.lineTo(x - s * 0.5, y); g.fill();
        g.globalAlpha = 0.12; g.beginPath(); g.arc(x, y - s, s * 0.9, 0, 7); g.fill(); g.globalAlpha = 1;
      }
    }
  });
}

// juntar geometrias numa malha só (com cor por vértice)
class GeoBag {
  constructor() { this.parts = []; }
  add(geo, matrix, color = '#ffffff') { geo.applyMatrix4(matrix); this.parts.push({ geo: geo.index ? geo : geo, color: new THREE.Color(color) }); }
  box(w, h, d, pos, color, rz = 0) { this.add(new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().makeRotationZ(rz).setPosition(...pos), color); }
  build(material) {
    let nv = 0, ni = 0;
    for (const { geo } of this.parts) { nv += geo.attributes.position.count; ni += geo.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const { geo, color } of this.parts) {
      const n = geo.attributes.position.count;
      pos.set(geo.attributes.position.array, vo * 3); nor.set(geo.attributes.normal.array, vo * 3); uv.set(geo.attributes.uv.array, vo * 2);
      for (let i = 0; i < n; i++) col.set([color.r, color.g, color.b], (vo + i) * 3);
      const a = geo.index.array;
      for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
      io += a.length; vo += n; geo.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return new THREE.Mesh(out, material);
  }
}

// posição de uma casa da grade no terrário (metros, eixo y para cima)
export const cellPos = (x, y) => [(x + 0.5 - W / 2) * CELL, (H / 2 - y - 0.5) * CELL];
export const posCell = (lx, ly) => [lx / CELL + W / 2 - 0.5, H / 2 - ly / CELL - 0.5];

// ---------- mundo ----------
export function buildWorld() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#000', 8, 30);
  const hemi = new THREE.HemisphereLight('#fff', '#333', 1.5);
  const sun = new THREE.DirectionalLight('#fff', 1.3);
  sun.position.set(-1, 3, 2);
  scene.add(hemi, sun);
  const glowTex = glowTexture();

  const themes = THEMES.map((th) => {
    const g = new THREE.Group();
    const pano = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 12, 48, 1, true), new THREE.MeshBasicMaterial({ map: panoramaTexture(th), side: THREE.BackSide, fog: false }));
    pano.position.y = 4;
    g.add(pano);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshLambertMaterial({ map: groundTexture(th) }));
    ground.rotation.x = -Math.PI / 2;
    g.add(ground);
    const deco = new GeoBag();
    if (th.name === 'quintal') {
      // canteiro com flores e um regador
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, r = 1.6 + (i % 3) * 0.2, x = Math.cos(a) * r, z = Math.sin(a) * r - 0.4;
        if (Math.abs(x) < 0.8 && z < 0 && z > -1.2) continue;
        deco.box(0.01, 0.3, 0.01, [x, 0.15, z], '#3a8a2a');
        deco.add(new THREE.SphereGeometry(0.05, 8, 6), new THREE.Matrix4().setPosition(x, 0.32, z), ['#ff5a7a', '#ffe05a', '#ffffff', '#c07aff'][i % 4]);
      }
      deco.add(new THREE.CylinderGeometry(0.12, 0.14, 0.26, 14), new THREE.Matrix4().setPosition(1.1, 0.13, -1.3), '#3a9ad8');
      deco.box(0.3, 0.03, 0.04, [1.3, 0.22, -1.3], '#3a9ad8', -0.6);
    } else if (th.name === 'raizes') {
      // raízes grossas saindo do chão
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i - 4.5) * 0.35, x = Math.cos(a) * 2.2, z = Math.sin(a) * 2.2;
        const m = new THREE.Matrix4().makeRotationY(-a).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
        m.setPosition(x, 0.06, z);
        deco.add(new THREE.CylinderGeometry(0.09, 0.14, 1.4, 8), m, '#5a3a1a');
      }
      for (let i = 0; i < 6; i++) deco.add(new THREE.SphereGeometry(0.07, 10, 8), new THREE.Matrix4().makeScale(1, 1.3, 1).setPosition(-1.2 + i * 0.5, 0.07, 1.0 + (i % 2) * 0.3), '#ffa830');
    } else {
      // cristais grandes no chão da caverna
      const cols = ['#5ae8ff', '#c08aff', '#ff7ad8', '#7affb0'];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2, r = 1.8 + (i % 4) * 0.4;
        const m = new THREE.Matrix4().makeRotationZ((i % 5 - 2) * 0.15).setPosition(Math.cos(a) * r, 0.25 + (i % 3) * 0.1, Math.sin(a) * r);
        deco.add(new THREE.ConeGeometry(0.1 + (i % 3) * 0.05, 0.6 + (i % 4) * 0.25, 6), m, cols[i % 4]);
      }
    }
    if (deco.parts.length) {
      const mat = th.name === 'caverna' ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
      g.add(deco.build(mat));
    }
    if (th.name === 'caverna') {
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: ['#5ae8ff', '#c08aff', '#ff7ad8'][i % 3], transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
        const a = (i / 6) * Math.PI * 2; s.position.set(Math.cos(a) * 2.4, 0.5, Math.sin(a) * 2.4); s.scale.setScalar(1.4); g.add(s);
      }
    }
    g.visible = false;
    scene.add(g);
    return g;
  });

  // pedestal (banquinho de madeira)
  const ped = new GeoBag();
  ped.box(0.6, 0.04, 0.3, [0, PEDESTAL.top - 0.02, PEDESTAL.z], '#a8743a');
  for (const x of [-0.26, 0.26]) for (const z of [-0.11, 0.11]) ped.box(0.04, PEDESTAL.top - 0.04, 0.04, [x, (PEDESTAL.top - 0.04) / 2, PEDESTAL.z + z], '#7a5028');
  ped.box(0.52, 0.03, 0.03, [0, 0.25, PEDESTAL.z - 0.11], '#7a5028');
  ped.box(0.52, 0.03, 0.03, [0, 0.25, PEDESTAL.z + 0.11], '#7a5028');
  scene.add(ped.build(new THREE.MeshLambertMaterial({ vertexColors: true })));

  // ---------- terrário ----------
  const tank = new THREE.Group();
  tank.position.copy(TANK_HOME);
  scene.add(tank);
  const tw = W * CELL, th0 = H * CELL, d = TANK.depth;
  // terra: textura do canvas na frente e atrás (linhas 1 a 11)
  const dirtCanvas = document.createElement('canvas');
  dirtCanvas.width = W * 32; dirtCanvas.height = (H - 1) * 32;
  const dirtTex = new THREE.CanvasTexture(dirtCanvas); dirtTex.colorSpace = THREE.SRGBColorSpace; dirtTex.anisotropy = 4;
  const slabH = (H - 1) * CELL;
  const dirtMat = new THREE.MeshLambertMaterial({ map: dirtTex });
  const sideMat = new THREE.MeshLambertMaterial({ color: '#5a3a1e' });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(tw, slabH, d * 0.7), [sideMat, sideMat, sideMat, sideMat, dirtMat, dirtMat]);
  slab.position.y = -th0 / 2 + slabH / 2;
  tank.add(slab);
  // moldura de madeira e vidro
  const frame = new GeoBag();
  const fw = 0.014;
  for (const z of [-d / 2, d / 2]) {
    frame.box(tw + fw * 2, fw, fw, [0, -th0 / 2 - fw / 2, z], '#ffffff');
    frame.box(tw + fw * 2, fw, fw, [0, th0 / 2 + fw / 2, z], '#ffffff');
    frame.box(fw, th0 + fw * 2, fw, [-tw / 2 - fw / 2, 0, z], '#ffffff');
    frame.box(fw, th0 + fw * 2, fw, [tw / 2 + fw / 2, 0, z], '#ffffff');
  }
  frame.box(tw + fw * 2, fw * 1.6, d + fw, [0, -th0 / 2 - fw * 1.3, 0], '#ffffff');
  for (const x of [-tw / 2 - fw / 2, tw / 2 + fw / 2]) frame.box(fw, fw, d, [x, -th0 / 2 - fw / 2, 0], '#ffffff');
  const frameMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: '#a8743a' });
  tank.add(frame.build(frameMat));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(tw, th0, d), new THREE.MeshLambertMaterial({ color: '#d8f0ff', transparent: true, opacity: 0.12, depthWrite: false }));
  tank.add(glass);
  // tufos de grama na superfície
  const grass = new GeoBag();
  for (let i = 0; i < 40; i++) {
    const x = -tw / 2 + 0.006 + (i / 39) * (tw - 0.012), h = 0.008 + (i * 7 % 5) * 0.003;
    grass.add(new THREE.ConeGeometry(0.004, h, 4), new THREE.Matrix4().makeRotationZ(((i * 13) % 7 - 3) * 0.08).setPosition(x, th0 / 2 - CELL + h / 2, ((i * 5) % 3 - 1) * d * 0.25), i % 3 ? '#5ab040' : '#3a8a2a');
  }
  const grassMesh = grass.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  tank.add(grassMesh);
  // alça em cima (para pegar)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 8, 16, Math.PI), new THREE.MeshLambertMaterial({ color: '#c8a070' }));
  handle.position.set(0, th0 / 2 + fw, 0);
  tank.add(handle);
  const grabGlow = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.05, th0 + 0.05, d + 0.04), new THREE.MeshBasicMaterial({ color: '#ffb43a', transparent: true, opacity: 0.0, depthWrite: false, wireframe: true }));
  tank.add(grabGlow);

  // ---------- letreiro do placar (atrás do terrário) ----------
  const MW = 0.9;
  const marquee = new THREE.Group();
  const frameM = new THREE.MeshLambertMaterial({ color: '#2a1a10' });
  marquee.add(new THREE.Mesh(new THREE.BoxGeometry(MW, 0.13, 0.03), frameM));
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1024; boardCanvas.height = 128;
  const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = 4;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(MW - 0.04, 0.105), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
  sign.position.z = 0.016;
  marquee.add(sign);
  const NB = 30;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), NB);
  for (let k = 0; k < NB; k++) {
    const m = new THREE.Matrix4();
    if (k < 14) m.setPosition(-MW / 2 + 0.02 + k * (MW - 0.04) / 13, 0.06, 0.018);
    else if (k < 28) m.setPosition(MW / 2 - 0.02 - (k - 14) * (MW - 0.04) / 13, -0.06, 0.018);
    else m.setPosition((k < 29 ? -1 : 1) * (MW / 2 - 0.008), 0, 0.018);
    bulbs.setMatrixAt(k, m);
    bulbs.setColorAt(k, new THREE.Color('#ffb43a'));
  }
  marquee.add(bulbs);
  marquee.position.set(0, 1.7, -0.95);
  marquee.rotation.x = 0.1;
  scene.add(marquee);

  let cur = -1;
  const _c = new THREE.Color();
  return {
    scene, themes, tank, slab, dirtCanvas, dirtTex, glass, grabGlow, marquee, glowTex, frameMat,
    setTheme(i) {
      if (i === cur) return;
      cur = i;
      const t = THEMES[i];
      themes.forEach((g, k) => { g.visible = k === i; });
      scene.background = new THREE.Color(t.bg);
      scene.fog.color.set(t.fog); scene.fog.near = t.fogNear; scene.fog.far = t.fogFar;
      hemi.color.set(t.hemi[0]); hemi.groundColor.set(t.hemi[1]); hemi.intensity = t.hemi[2];
      sun.color.set(t.sun[0]); sun.intensity = t.sun[1];
      frameMat.color.set(t.frame);
      grassMesh.visible = t.name !== 'caverna';
    },
    get theme() { return THEMES[cur]; },
    update(dt, time) {
      for (let k = 0; k < NB; k++) {
        const on = (Math.floor(time * 6) + k) % 3 === 0;
        _c.set(on ? THEMES[cur].glow : '#2a1e14');
        bulbs.setColorAt(k, _c);
      }
      bulbs.instanceColor.needsUpdate = true;
    },
    setBoard(lines) {
      const key = JSON.stringify(lines);
      if (key === this._last) return;
      this._last = key;
      const g = boardCanvas.getContext('2d'), w = 1024, h = 128;
      g.fillStyle = '#0c0806'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.04)';
      for (let x = 4; x < w; x += 8) for (let y = 4; y < h; y += 8) g.fillRect(x, y, 3, 3);
      g.textBaseline = 'middle';
      for (const l of lines) {
        g.font = `bold ${l.size || 54}px monospace`;
        g.textAlign = l.align || 'left';
        g.fillStyle = l.color || '#ffb43a';
        g.shadowColor = l.color || '#ffb43a'; g.shadowBlur = 12;
        g.fillText(l.text, l.x, l.y ?? h / 2);
      }
      g.shadowBlur = 0;
      boardTex.needsUpdate = true;
    },
  };
}

// ---------- personagens (em metros; olhando para +x) ----------
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const S = CELL;
function legs(g, n, mat, len, y, spread) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    const l = new THREE.Mesh(new THREE.BoxGeometry(S * 0.04, len, S * 0.04), mat);
    l.position.set((k - (n / 2 - 1) / 2) * spread, y - len / 2, side * S * 0.12);
    l.rotation.x = side * 0.5;
    g.add(l); out.push(l);
  }
  return out;
}
export function buildAnt() {
  const g = new THREE.Group();
  const body = lam('#d8402a'), dark = lam('#5a1a10'), blue = lam('#2a7ad8');
  const abd = new THREE.Mesh(new THREE.SphereGeometry(S * 0.2, 12, 8), body); abd.scale.set(1.3, 1, 1); abd.position.x = -S * 0.25;
  const tho = new THREE.Mesh(new THREE.SphereGeometry(S * 0.12, 10, 8), body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(S * 0.14, 12, 8), body); head.position.x = S * 0.24; head.position.y = S * 0.04;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(S * 0.045, 8, 6), lam('#ffffff')); eye.position.set(S * 0.32, S * 0.08, S * 0.08);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(S * 0.025, 6, 4), dark); pupil.position.set(S * 0.36, S * 0.08, S * 0.11);
  const eye2 = eye.clone(); eye2.position.z = -S * 0.08; const pupil2 = pupil.clone(); pupil2.position.z = -S * 0.11;
  for (const z of [-0.05, 0.05]) { const an = new THREE.Mesh(new THREE.BoxGeometry(S * 0.025, S * 0.22, S * 0.025), dark); an.position.set(S * 0.3, S * 0.22, z * S); an.rotation.z = -0.5; g.add(an); }
  // a bomba de ar nas costas
  const tankM = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.08, S * 0.08, S * 0.26, 10), blue); tankM.rotation.z = Math.PI / 2; tankM.position.set(-S * 0.1, S * 0.2, 0);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.025, S * 0.025, S * 0.18, 6), lam('#ffe05a')); nozzle.rotation.z = Math.PI / 2; nozzle.position.set(S * 0.12, S * 0.2, 0);
  g.add(abd, tho, head, eye, pupil, eye2, pupil2, tankM, nozzle);
  const ls = legs(g, 6, dark, S * 0.22, -S * 0.04, S * 0.12);
  g.userData = { legs: ls, abd };
  return g;
}
function buildBeetle(color, big = 1, horn = false) {
  const g = new THREE.Group();
  const shell = lam(color, { emissive: '#000000' }), dark = lam('#141414');
  const body = new THREE.Mesh(new THREE.SphereGeometry(S * 0.3 * big, 14, 10), shell); body.scale.set(1.25, 0.85, 0.9);
  const line = new THREE.Mesh(new THREE.BoxGeometry(S * 0.7 * big, S * 0.02, S * 0.02), dark); line.position.y = S * 0.25 * big;
  const head = new THREE.Mesh(new THREE.SphereGeometry(S * 0.15 * big, 10, 8), dark); head.position.x = S * 0.36 * big;
  const eyeM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const eyes = new THREE.Group();
  for (const z of [-0.07, 0.07]) { const e = new THREE.Mesh(new THREE.SphereGeometry(S * 0.06 * big, 8, 6), eyeM); e.position.set(S * 0.45 * big, S * 0.07 * big, z * S * big); eyes.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(S * 0.03 * big, 6, 4), new THREE.MeshBasicMaterial({ color: '#000' })); p.position.set(S * 0.5 * big, S * 0.07 * big, z * S * big); eyes.add(p); }
  g.add(body, line, head, eyes);
  if (horn) { const h = new THREE.Mesh(new THREE.ConeGeometry(S * 0.08 * big, S * 0.4 * big, 8), lam('#2a1a10')); h.rotation.z = -Math.PI / 2 + 0.6; h.position.set(S * 0.55 * big, S * 0.15 * big, 0); g.add(h); }
  const ls = legs(g, 6, dark, S * 0.2 * big, -S * 0.12 * big, S * 0.16 * big);
  g.userData = { legs: ls, shell, body, eyes, parts: [body, line, head, ...ls] };
  return g;
}
function buildCaterpillar(n = 4, big = 1, crown = false) {
  const g = new THREE.Group();
  const skin = lam('#ff7a2a', { emissive: '#000000' }), spot = lam('#ffe05a'), dark = lam('#2a1008');
  const segs = [];
  for (let i = 0; i < n; i++) {
    const r = S * (0.17 - i * 0.015) * big;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), skin);
    m.position.x = (0.25 - i * 0.2) * S * big;
    const d = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 6, 4), spot); d.position.set(0, r * 0.8, 0); m.add(d);
    g.add(m); segs.push(m);
  }
  const eyeM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (const z of [-0.06, 0.06]) { const e = new THREE.Mesh(new THREE.SphereGeometry(S * 0.045 * big, 8, 6), eyeM); e.position.set(S * 0.35 * big, S * 0.07 * big, z * S * big); g.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(S * 0.022 * big, 6, 4), dark); p.position.set(S * 0.39 * big, S * 0.07 * big, z * S * big); g.add(p); }
  if (crown) for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(S * 0.03 * big, S * 0.1 * big, 4), lam('#ffd24a', { emissive: '#3a2a00' })); c.position.set(S * (0.18 + k * 0.035) * big, S * 0.2 * big, (k - 2) * S * 0.03 * big); g.add(c); }
  const mouth = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ffcc40', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  mouth.position.x = S * 0.45 * big; mouth.scale.setScalar(S * 0.6 * big);
  g.add(mouth);
  g.userData = { segs, skin, mouth };
  return g;
}
function buildSpider() {
  const g = new THREE.Group();
  const crystal = new THREE.MeshLambertMaterial({ color: '#7af0ff', emissive: '#1a5a6a', transparent: true, opacity: 0.85 });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(S * 0.32, 0), crystal);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(S * 0.18, 0), crystal); head.position.x = S * 0.36;
  g.add(body, head);
  const ls = [];
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    const l = new THREE.Mesh(new THREE.BoxGeometry(S * 0.04, S * 0.5, S * 0.04), crystal);
    l.position.set((k - 1.5) * S * 0.14, -S * 0.12, side * S * 0.2);
    l.rotation.set(side * 0.9, 0, (k - 1.5) * 0.4);
    g.add(l); ls.push(l);
  }
  const eyeM = new THREE.MeshBasicMaterial({ color: '#ff3a8a' });
  for (let k = 0; k < 4; k++) { const e = new THREE.Mesh(new THREE.SphereGeometry(S * 0.03, 6, 4), eyeM); e.position.set(S * 0.5, S * (0.02 + (k >> 1) * 0.06), (k % 2 ? 1 : -1) * S * 0.05); g.add(e); }
  g.userData = { legs: ls, crystal, body };
  return g;
}
function buildRock() {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(S * 0.45, 0), lam('#8a8a90'));
  m.scale.set(1.1, 0.9, 0.7);
  return m;
}
function buildFruit() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(S * 0.28, 12, 10), lam('#ff2a3a', { emissive: '#400008' }));
  b.scale.set(1, 1.15, 0.9);
  for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(S * 0.06, S * 0.2, 4), lam('#3aa83a')); l.position.set(Math.cos(k * 1.26) * S * 0.08, S * 0.3, Math.sin(k * 1.26) * S * 0.08); l.rotation.z = Math.cos(k * 1.26) * 0.8; g.add(l); }
  for (let k = 0; k < 12; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(S * 0.025, 4, 3), lam('#ffe05a')); const a = k * 2.4, y = -0.2 + (k % 4) * 0.12; s.position.set(Math.cos(a) * S * 0.26, y * S, Math.sin(a) * S * 0.22); g.add(s); }
  g.add(b);
  return g;
}

// ---------- o terrário de uma fase ----------
export class TankView {
  constructor(world) {
    this.world = world;
    this.tank = world.tank;
    this.root = new THREE.Group();
    this.root.position.z = TANK.depth * 0.36;    // na frente da terra, atrás do vidro
    this.tank.add(this.root);
    this.ant = buildAnt();
    this.root.add(this.ant);
    this.hose = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.05, S * 0.05, 1, 6), new THREE.MeshBasicMaterial({ color: '#ffe05a' }));
    this.hose.rotation.z = Math.PI / 2; this.hose.visible = false;
    this.root.add(this.hose);
    this.puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: world.glowTex, color: '#e8f8ff', transparent: true, opacity: 0, depthWrite: false }));
    this.root.add(this.puff);
    this.target = new THREE.Mesh(new THREE.TorusGeometry(S * 0.3, S * 0.04, 6, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }));
    this.target.visible = false;
    this.root.add(this.target);
    this.fruit = buildFruit(); this.fruit.visible = false; this.root.add(this.fruit);
    this.webTex = webTexture();
    this.web = new THREE.Mesh(new THREE.PlaneGeometry(S * 1.4, S * 1.4), new THREE.MeshBasicMaterial({ map: this.webTex, transparent: true, depthWrite: false }));
    this.web.visible = false; this.root.add(this.web);
    const fireMat = new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.fires = new THREE.InstancedMesh(new THREE.BoxGeometry(S * 0.95, S * 0.6, S * 0.3), fireMat, 16);
    this.fires.count = 0; this.fires.frustumCulled = false;
    this.root.add(this.fires);
    this.enemyViews = new Map();
    this.rockViews = new Map();
    this.ver = -1;
    this.noise = new Float32Array(W * H * 6).map(() => Math.random());
  }
  build(game) {
    this.game = game;
    for (const v of this.enemyViews.values()) this.root.remove(v);
    for (const v of this.rockViews.values()) this.root.remove(v);
    this.enemyViews.clear(); this.rockViews.clear();
    this.ver = -1;
    this.paint(game);
  }
  // pinta a terra: camadas, túneis, raízes/cristais (só quando muda)
  paint(game) {
    if (game.dugVer === this.ver && game === this.paintedGame) return;
    this.ver = game.dugVer; this.paintedGame = game;
    const th = THEMES[game.L.world];
    const g = this.world.dirtCanvas.getContext('2d'), C = 32;
    const layer = (y) => th.layers[y <= 2 ? 0 : y <= 5 ? 1 : y <= 8 ? 2 : 3];
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x * C, py = (y - 1) * C, c = game.cell(x, y), n = this.noise, i = (y * W + x) * 6;
      g.fillStyle = layer(y); g.fillRect(px, py, C, C);
      // grãos de terra (sempre iguais na mesma casa)
      for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.12)'; g.fillRect(px + n[i + k] * 28, py + n[i + (k + 3) % 6] * 28, 3, 3); }
      if (c === DUG) {
        g.fillStyle = th.tunnel;
        g.beginPath(); g.roundRect ? g.roundRect(px + 3, py + 3, C - 6, C - 6, 9) : g.rect(px + 3, py + 3, C - 6, C - 6); g.fill();
        // liga com os vizinhos abertos
        if (game.cell(x + 1, y) === DUG) g.fillRect(px + C / 2, py + 3, C / 2 + 3, C - 6);
        if (game.cell(x - 1, y) === DUG) g.fillRect(px - 3, py + 3, C / 2 + 3, C - 6);
        if (game.cell(x, y + 1) === DUG) g.fillRect(px + 3, py + C / 2, C - 6, C / 2 + 3);
        if (game.cell(x, y - 1) === DUG || y === 1) g.fillRect(px + 3, py - 3, C - 6, C / 2 + 3);
      } else if (c === ROOT) {
        if (th.name === 'caverna') {
          g.fillStyle = '#1a1830'; g.fillRect(px, py, C, C);
          const cols = ['#5ae8ff', '#c08aff', '#ff7ad8'];
          for (let k = 0; k < 3; k++) { g.fillStyle = cols[(x + y + k) % 3]; g.beginPath(); const cx = px + 6 + k * 10, h = 14 + n[i + k] * 12; g.moveTo(cx, py + C - 2); g.lineTo(cx + 5, py + C - 2 - h); g.lineTo(cx + 10, py + C - 2); g.fill(); }
        } else {
          // raiz: madeira clara com veios, bem visível na terra
          g.fillStyle = '#c8945a'; g.fillRect(px, py + 3, C, C - 6);
          g.fillStyle = '#e8b87a'; g.fillRect(px, py + 7, C, 4);
          g.strokeStyle = '#7a4a22'; g.lineWidth = 2;
          for (const yy of [14, 20, 25]) { g.beginPath(); g.moveTo(px, py + yy); g.bezierCurveTo(px + 10, py + yy - 3, px + 20, py + yy + 3, px + C, py + yy); g.stroke(); }
          g.strokeStyle = '#4a2a10'; g.lineWidth = 3; g.strokeRect(px + 0.5, py + 3, C - 1, C - 6);
        }
      }
    }
    this.world.dirtTex.needsUpdate = true;
  }
  enemyView(e) {
    let v = this.enemyViews.get(e.id);
    if (v) return v;
    if (e.kind === 'beetle') v = buildBeetle('#2a8a6a');
    else if (e.kind === 'rhino') v = buildBeetle('#5a3a20', 1.45, true);
    else if (e.kind === 'fire') v = buildCaterpillar(4);
    else if (e.kind === 'queen') v = buildCaterpillar(6, 1.35, true);
    else v = buildSpider();
    v.userData.kind = e.kind;
    this.root.add(v);
    this.enemyViews.set(e.id, v);
    return v;
  }
  update(game, dt, time, hand) {
    this.paint(game);
    // formiga
    const a = game.ant, av = this.ant;
    av.visible = a.alive && !(a.inv > 0 && Math.floor(time * 12) % 2 === 0);
    const [ax, ay] = cellPos(a.x, a.y);
    av.position.set(ax, ay, 0);
    const [fx, fy] = a.face;
    if (fy) av.rotation.set(0, 0, fy < 0 ? Math.PI / 2 : -Math.PI / 2); else av.rotation.set(0, fx < 0 ? Math.PI : 0, 0);
    av.userData.legs.forEach((l, k) => { l.rotation.z = a.moving ? Math.sin(time * 30 + k * 1.7) * 0.6 : 0; });
    if (!a.alive) { av.visible = true; av.rotation.z = time * 8; av.scale.setScalar(Math.max(0.2, 1 - (game.dieT ? 1 - game.dieT / 1.8 : 0))); } else av.scale.setScalar(1);
    // mangueira
    const hoseE = a.hose ? game.enemies.find(e => e.id === a.hose) : null;
    this.hoseT = Math.max(0, (this.hoseT || 0) - dt);
    if (hoseE || this.hoseT > 0) {
      const [ex, ey] = hoseE ? cellPos(hoseE.x, hoseE.y) : cellPos(a.x + a.face[0] * this.hoseLen, a.y + a.face[1] * this.hoseLen);
      const dx = ex - ax, dy = ey - ay, L = Math.hypot(dx, dy);
      this.hose.visible = L > 0.001;
      this.hose.position.set((ax + ex) / 2, (ay + ey) / 2, 0.002);
      this.hose.scale.set(1, L, 1);
      this.hose.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2);
    } else this.hose.visible = false;
    this.puff.material.opacity = Math.max(0, this.puff.material.opacity - dt * 4);
    // alvo do dedo
    this.target.visible = !!hand;
    if (hand) { const [tx, ty] = cellPos(hand[0], hand[1]); this.target.position.set(tx, ty, 0.004); this.target.rotation.z = time * 2; }
    // bichos
    const seen = new Set();
    let nf = 0;
    const m4 = new THREE.Matrix4();
    this.web.visible = false;
    for (const e of game.enemies) {
      if (!e.alive) continue;
      seen.add(e.id);
      const v = this.enemyView(e), ud = v.userData;
      v.visible = e.hidden <= 0;
      const [x, y] = cellPos(e.x, e.y);
      v.position.set(x, y, 0);
      v.rotation.y = e.face < 0 ? Math.PI : 0;
      const ghost = e.mode === 'ghost' && e.kind !== 'spider';
      const inf = e.inflate;
      const need = BOSS[e.kind]?.pumps ?? 4;
      v.scale.setScalar(1 + (inf / need) * 0.9 + (e.fireWarn > 0 ? 0.08 * Math.sin(time * 40) : 0));
      const mats = [];
      v.traverse((o) => { if (o.material && o.material.isMeshLambertMaterial) mats.push(o.material); });
      for (const mt of mats) {
        if (!mt.userData.base) mt.userData.base = { op: mt.opacity, tr: mt.transparent };
        mt.transparent = ghost || mt.userData.base.tr;
        mt.opacity = ghost ? 0.18 : mt.userData.base.op;
        if (mt.emissive) mt.emissive.set(inf ? '#5a5a5a' : e.frozen > 0 ? '#2a4a8a' : (e.angry > 0 ? '#5a0a0a' : '#000000'));
      }
      if (ud.legs) ud.legs.forEach((l, k) => { l.rotation.z = (e.mode === 'walk' && !inf && e.frozen <= 0) || ghost ? Math.sin(time * 22 + k) * 0.5 : 0; });
      if (ud.segs) ud.segs.forEach((s, k) => { s.position.y = Math.sin(time * 9 - k) * S * 0.04; });
      if (ud.mouth) ud.mouth.material.opacity = e.fireWarn > 0 ? 0.5 + 0.5 * Math.sin(time * 30) : 0;
      if (e.kind === 'spider' && e.weave > 0) { this.web.visible = true; this.web.position.set(x, y, -0.002); this.web.rotation.z = time * 0.3; }
      if (e.fireOn > 0) for (const [cx, cy] of e.fireCells) {
        if (nf >= 16) break;
        const [px, py] = cellPos(cx, cy);
        m4.makeScale(1, 0.8 + 0.3 * Math.sin(time * 40 + cx), 1).setPosition(px, py, 0.003);
        this.fires.setMatrixAt(nf++, m4);
      }
    }
    for (const [id, v] of this.enemyViews) if (!seen.has(id)) { this.root.remove(v); this.enemyViews.delete(id); }
    this.fires.count = nf; this.fires.instanceMatrix.needsUpdate = true;
    // pedras
    const rseen = new Set();
    for (const r of game.rocks) {
      rseen.add(r.id);
      let v = this.rockViews.get(r.id);
      if (!v) { v = buildRock(); v.rotation.set(r.id, r.id * 2, 0); this.root.add(v); this.rockViews.set(r.id, v); }
      const [x, y] = cellPos(r.x, r.state === 'fall' || r.state === 'land' ? r.fy : r.y);
      v.position.set(x + (r.state === 'wobble' ? Math.sin(time * 50) * S * 0.06 : 0), y, 0);
      v.scale.set(1.1, 0.9, 0.7).multiplyScalar(r.state === 'land' ? Math.max(0.1, r.t / 0.6) : 1);
    }
    for (const [id, v] of this.rockViews) if (!rseen.has(id)) { this.root.remove(v); this.rockViews.delete(id); }
    // frutinha
    this.fruit.visible = !!game.fruit;
    if (game.fruit) { const [x, y] = cellPos(game.fruit.x, game.fruit.y); this.fruit.position.set(x, y + Math.sin(time * 4) * S * 0.05, 0); this.fruit.rotation.y = time; }
  }
  pumpShot(game, len) { this.hoseT = 0.15; this.hoseLen = len; const a = game.ant; const [x, y] = cellPos(a.x + a.face[0] * len, a.y + a.face[1] * len); this.puff.position.set(x, y, 0.004); this.puff.scale.setScalar(S * 0.8); this.puff.material.opacity = 0.8; }
  // posição de uma casa no mundo
  worldOf(x, y) {
    const [lx, ly] = cellPos(x, y);
    return this.root.localToWorld(new THREE.Vector3(lx, ly, 0)).toArray();
  }
}

// ---------- partículas (um só Points) ----------
export class Particles {
  constructor(parent, cap = 900) {
    this.cap = cap;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.s0 = new Float32Array(cap); this.grav = new Float32Array(cap);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: 'attribute vec3 pcolor; attribute float size; attribute float alpha; uniform float uScale; varying vec3 vC; varying float vA; void main(){ vC = pcolor; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(96.0, size * uScale / max(0.05, -mv.z)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 q = abs(gl_PointCoord - 0.5); if (max(q.x, q.y) > 0.5) discard; float a = vA * (1.0 - max(q.x, q.y) * 1.2); gl_FragColor = vec4(vC * a, a); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.tmp = new THREE.Color();
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, grav = 0.3) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3);
    this.tmp.set(color);
    this.col.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
    this.life[i] = this.max[i] = life; this.s0[i] = size; this.size[i] = size; this.alpha[i] = 1; this.grav[i] = grav;
  }
  burst(p, color, n, speed, life = 0.5, size = 0.005, grav = 0.3) {
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(p[0], p[1], p[2], Math.cos(a) * r * s, u * s, Math.sin(a) * r * s * 0.3, life * (0.5 + Math.random() * 0.6), size * (0.5 + Math.random()), color, grav);
    }
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= this.grav[i] * dt;
      for (let j = 0; j < 3; j++) { this.v[i * 3 + j] *= 1 - 2 * dt; this.p[i * 3 + j] += this.v[i * 3 + j] * dt; }
      const f = Math.max(0, this.life[i] / this.max[i]);
      this.alpha[i] = Math.min(1, f * 2);
      this.size[i] = this.s0[i] * (0.5 + 0.5 * f);
    }
    for (const a of ['position', 'size', 'alpha', 'pcolor']) this.geo.attributes[a].needsUpdate = true;
  }
}
void DIRT; void ROCK;
