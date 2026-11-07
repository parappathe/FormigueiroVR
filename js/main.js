// Liga as regras (sim.js) à tela, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { Game, DT, CELL, TANK, LIVES, ANT, BOSS } from './sim.js';
import { LEVELS, WORLDS, LEVELS_PER_WORLD, W, H } from './levels.js';
import { makeRobot } from './robot.js';
import { buildWorld, TankView, Particles, THEMES, TANK_HOME, posCell } from './scene.js';
import { Panel, Label, C as UI } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave, rankOf, addScore } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
sfx.musicOn = save.music;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BOSS_NAME = { rhino: 'Besouro-rinoceronte', queen: 'Lagartona', spider: 'Aranha de Cristal' };
const WHY = { beetle: 'O besouro te pegou!', fire: 'Lagarta-de-fogo!', rhino: 'O rinoceronte te pegou!', queen: 'A Lagartona te pegou!', spider: 'A aranha te pegou!', rock: 'Uma pedra caiu em você!' };

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld();
const { scene, tank } = world;
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.02, 60);
const rig = new THREE.Group();          // VR: referência do óculos (recentralizar põe a cabeça em x = 0, z = 0)
scene.add(rig);
rig.add(camera);
const PC_CAM = new THREE.Vector3(0, 1.2, 0.4);

const tankView = new TankView(world);
const particles = new Particles(scene);
// plano invisível na frente da terra (mouse e dedo)
const hitPlane = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), new THREE.MeshBasicMaterial({ visible: false }));
tankView.root.add(hitPlane);

// menus e placas
const panel = new Panel(0.9);
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);
const msgLabel = new Label(0.5, 1024, 128);
scene.add(msgLabel.mesh);
msgLabel.mesh.visible = false;

// ---------- Estado ----------
let app = 'menu';            // 'menu' | 'playing' | 'paused' | 'done' | 'initials'
let mode = 'level';          // 'level' (fase avulsa) | 'arcade' (fliperama: as 12 seguidas)
let level = 0;
let game = null;
let robot = makeRobot();
let demo = true;             // no menu do PC o robô joga sozinho, ao fundo, sem som
let msg = null;
let doneTimer = 0;
let lastResult = null, newRecord = false;
const arcade = { score: 0, lives: LIVES, rank: -1, over: false, letters: [0, 0, 0], slot: 0 };
let pumpQueued = false;
let fingerCell = null;       // [x, y] na grade (dedo ou mouse)

const unlocked = (i) => i === 0 || !!save.done[i - 1];
const nextLevel = () => { let n = 0; while (n < LEVELS.length - 1 && save.done[n]) n++; return n; };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function newGame(lv, opts = {}) {
  level = clamp(lv, 0, LEVELS.length - 1);
  const L = LEVELS[level];
  world.setTheme(L.world);
  game = new Game(level, opts);
  tankView.build(game);
  robot.reset();
  acc = 0;
  pumpQueued = false;
  sfx.lastOne = false;
  sfx.setSong(L.world, !demo);
}

function startLevel(lv, m = mode) {
  mode = m;
  demo = false;
  arcade.counted = false;
  newGame(lv, { seed: Math.floor(Math.random() * 1e6), lives: mode === 'arcade' ? arcade.lives : LIVES });
  app = 'playing';
  doneTimer = 0;
  panel.hide();
  const L = LEVELS[level], Wd = WORLDS[L.world];
  const boss = { rhino: 'Ele não infla: a bomba só segura. Derrube pedras nele (2 vezes)!', queen: 'Infle 6 vezes para estourar. Estoure ela 4 vezes; ela deixa ovos!', spider: 'Ela atravessa a terra. Só pega bomba quando para para tecer a teia!' }[L.boss];
  const head = level % LEVELS_PER_WORLD === 0 ? `${Wd.name}. ${Wd.hint}` : L.boss ? `Chefe: ${L.name}! ${boss}` : `Fase ${level + 1}: ${L.name}`;
  showMsg(head, 6, '#fbf3e4');
  sfx.coin();
  updateHint();
}

function startArcade() {
  arcade.score = 0; arcade.lives = LIVES; arcade.rank = -1; arcade.over = false;
  startLevel(0, 'arcade');
}

function togglePause() {
  if (app === 'playing') { app = 'paused'; showScreen('pause'); }
  else if (app === 'paused') { app = 'playing'; panel.hide(); }
  sfx.setSong(LEVELS[level].world, app === 'playing');
  updateHint();
}

function goMenu() {
  app = 'menu';
  demo = !renderer.xr.isPresenting;
  newGame(demo ? Math.floor(Math.random() * LEVELS.length) : nextLevel(), { seed: Math.floor(Math.random() * 1e6) });
  showScreen('main');
  updateHint();
}

function showMsg(text, t = 2, color = '#ffb43a') { msg = { text, t, color }; }
const pad6 = (n) => String(Math.max(0, Math.round(n))).padStart(6, '0');
const totalStars = () => Object.values(save.done).reduce((s, d) => s + (d.stars || 0), 0);
const leftText = () => {
  const n = game.alive().length;
  if (game.boss && game.bossE?.alive) return `chefe: ${game.bossE.hp} de vida${n > 1 ? ` · +${n - 1} bicho${n > 2 ? 's' : ''}` : ''}`;
  return `faltam ${n} bicho${n === 1 ? '' : 's'}`;
};

// ---------- Menus ----------
function showScreen(name) {
  const vr = renderer.xr.isPresenting;
  placePanel();
  panel.show((p) => {
    if (name === 'main') {
      p.title('Formigueiro', 76, 72);
      p.text('Guie a formiguinha com o dedo e estoure os bichos com a bomba de ar.', 512, 136, { size: 25, color: UI.dim });
      const next = nextLevel();
      p.button(save.done[0] ? `Continuar: fase ${next + 1}` : 'Começar', () => startLevel(next, 'level'), 262, 172, 500, 86, { size: 38 });
      p.button('Fliperama (as 12 seguidas)', () => startArcade(), 262, 272, 500, 74, { size: 30 });
      p.button('Escolher fase', () => showScreen('levels'), 262, 360, 245, 70, { size: 28 });
      p.button('Recordes', () => showScreen('scores'), 517, 360, 245, 70, { size: 28 });
      p.button('Como jogar', () => showScreen('help'), 262, 444, 500, 66, { size: 28 });
      const opt = (label, key, x, after) => p.button(`${label}: ${save[key] ? 'sim' : 'não'}`, () => { save[key] = !save[key]; storeSave(save); after?.(); showScreen('main'); }, x, 526, 220, 60, { size: 24 });
      opt('Som', 'sound', 152, () => sfx.setOn(save.sound));
      opt('Música', 'music', 402, () => sfx.setMusic(save.music));
      opt('FPS', 'fps', 652);
      p.text(`Estrelas: ${totalStars()} de ${LEVELS.length * 3}${save.scores[0] ? `   ·   Recorde: ${save.scores[0].name} ${save.scores[0].score}` : ''}`, 512, 622, { size: 25, color: UI.star });
      p.text(vr ? 'Aponte e aperte o gatilho para escolher' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 670, { size: 21, color: UI.dim });
    } else if (name === 'levels') {
      p.title('Escolher fase', 56, 48);
      WORLDS.forEach((Wd, w) => {
        const y = 100 + w * 190;
        p.text(Wd.name, 512, y + 6, { size: 26, bold: true, color: ['#8ad05a', '#ffa84a', '#5ae8ff'][w] });
        for (let k = 0; k < LEVELS_PER_WORLD; k++) {
          const i = w * LEVELS_PER_WORLD + k, L = LEVELS[i], d = save.done[i];
          p.tile(112 + k * 205, y + 26, 190, 140, { num: i + 1, name: L.boss ? `Chefe: ${L.name}` : L.name, stars: d?.stars || 0, done: !!d, locked: !unlocked(i), master: !!L.boss, action: () => startLevel(i, 'level') });
        }
      });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 652, 300, 56, { size: 28 });
    } else if (name === 'scores') {
      p.title('Recordes do fliperama', 60, 50);
      if (!save.scores.length) p.text('Ninguém ainda. Jogue o Fliperama: as 12 fases seguidas!', 512, 300, { size: 28, color: UI.dim });
      save.scores.forEach((e, i) => {
        const y = 130 + i * 56, hl = mode === 'arcade' && arcade.over && i === arcade.rank;
        p.text(`${i + 1}.`, 250, y, { size: 34, bold: true, color: hl ? UI.edge : UI.dim, align: 'right' });
        p.text(e.name, 300, y, { size: 38, bold: true, color: hl ? UI.edge : UI.text, align: 'left' });
        p.text(pad6(e.score), 620, y, { size: 38, bold: true, color: hl ? UI.edge : UI.star, align: 'right' });
        p.text(e.level >= 13 ? 'zerou!' : `fase ${e.level}`, 660, y, { size: 26, color: UI.dim, align: 'left' });
      });
      p.button('Fliperama', () => startArcade(), 262, 588, 245, 80, { size: 30 });
      p.button('Voltar', () => showScreen('main'), 517, 588, 245, 80, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 56);
      const rows = vr ? [
        'Encoste a ponta do controle (ou o dedo) no vidro: a formiga vai até lá cavando.',
        'Gatilho ou A/X: bomba de ar na direção em que ela olha. Bombeie de novo para inflar;',
        'estoura com 4. Parou de bombear, o bicho desinfla. Grip na moldura: pega o',
        'formigueiro para ver de perto (solte perto do banquinho para ele voltar).',
      ] : [
        'Mouse sobre o formigueiro (ou setas/WASD): a formiga vai até lá cavando.',
        'Clique ou espaço: bomba de ar na direção em que ela olha. Bombeie de novo para',
        'inflar; estoura com 4. Parou de bombear, o bicho desinfla. Esc ou P: pausa.',
        'Cave embaixo de uma pedra: ela cai e esmaga quem estiver embaixo.',
      ];
      rows.forEach((t, i) => p.text(t, 40, 112 + i * 44, { size: 22, align: 'left' }));
      const sp = [
        ['Besouro: vira fantasma e atravessa terra', '#5ad0a0'], ['Lagarta-de-fogo: brasa na horizontal', '#ff8a3a'],
        ['Pedra: esmagar 2 de uma vez vale mais', '#b8b8c0'], ['Frutinha: aparece depois de 2 pedras', '#ff5a6a'],
        ['Raiz e cristal: não se cava', '#c89a6a'], ['O último bicho foge pela superfície', '#ffd24a'],
      ];
      sp.forEach(([t, c], i) => p.text(t, 50 + (i % 2) * 480, 304 + Math.floor(i / 2) * 44, { size: 22, align: 'left', color: c }));
      p.text('Chefes na 4ª fase de cada mundo. Estrelas pelo tempo (cada vida perdida = +20 s).', 512, 470, { size: 22, color: UI.dim });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 560, 300, 76);
    } else if (name === 'pause') {
      p.title('Pausa', 64);
      p.text(`Fase ${level + 1}: ${LEVELS[level].name}${mode === 'arcade' ? '  ·  fliperama' : ''}`, 512, 122, { size: 28, color: UI.dim });
      p.button('Continuar', () => togglePause(), 262, 152, 500, 80);
      p.button(mode === 'arcade' ? 'Recomeçar o fliperama' : 'Recomeçar a fase', () => (mode === 'arcade' ? startArcade() : startLevel(level)), 262, 242, 500, 72, { size: 30 });
      p.button('Recentralizar', () => { recenter(); togglePause(); }, 262, 324, 245, 72, { size: 28, locked: !vr });
      p.button('Pôr no banquinho', () => { tankHome(); togglePause(); }, 517, 324, 245, 72, { size: 26 });
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; storeSave(save); sfx.setOn(save.sound); showScreen('pause'); }, 262, 406, 245, 66, { size: 26 });
      p.button(`Música: ${save.music ? 'sim' : 'não'}`, () => { save.music = !save.music; storeSave(save); sfx.setMusic(save.music); showScreen('pause'); }, 517, 406, 245, 66, { size: 26 });
      p.button('Como jogar', () => showScreen('help'), 262, 482, 500, 62, { size: 28 });
      p.button('Menu principal', () => goMenu(), 262, 556, 500, 72);
    } else if (name === 'done') {
      const r = lastResult, d = save.done[level], L = LEVELS[level];
      if (r.won) {
        p.title(newRecord ? 'Formigueiro limpo! Recorde!' : 'Formigueiro limpo!', 66, 52);
        p.stars(r.stars, 512, 140, 74);
        p.text(`Tempo ${r.time.toFixed(0)} s  ·  vidas perdidas ${r.livesLost}`, 512, 212, { size: 28 });
        p.text(`Pontos ${r.score}  (bônus ${r.bonus})`, 512, 256, { size: 34, bold: true, color: UI.edge });
        p.text(`3 estrelas até ${L.par[0]} s · 2 até ${L.par[1]} s (cada vida perdida = +20 s)`, 512, 298, { size: 21, color: UI.dim });
        if (d) p.text(`Melhor: ${d.stars} estrela${d.stars === 1 ? '' : 's'} · ${d.score} pontos`, 512, 332, { size: 22, color: UI.dim });
      } else {
        p.title(mode === 'arcade' ? 'Fim de jogo' : 'Acabaram as vidas', 70, 58);
        p.text(`Faltou: ${leftText()}`, 512, 160, { size: 32, color: UI.red });
        p.text('Dica: bombeie de longe (até 3 casas) e use as pedras!', 512, 214, { size: 25 });
      }
      if (mode === 'arcade') {
        p.text(`Fliperama: ${pad6(arcade.score)} pontos  ·  vidas ${arcade.lives}`, 512, 384, { size: 30, bold: true, color: UI.star });
        if (r.won && level < LEVELS.length - 1) p.button('Próxima fase', () => startLevel(level + 1, 'arcade'), 262, 420, 500, 92, { size: 38 });
        else p.button('Recordes', () => showScreen('scores'), 262, 420, 500, 92, { size: 38 });
        p.button('Menu principal', () => goMenu(), 262, 540, 500, 78);
      } else {
        if (level < LEVELS.length - 1) p.button('Próxima fase', () => startLevel(level + 1, 'level'), 262, 372, 500, 90, { size: 36, locked: !unlocked(level + 1) });
        else if (r.won) p.text('Você limpou os 12 formigueiros!', 512, 416, { size: 34, bold: true, color: UI.edge });
        p.button(r.won ? 'Repetir' : 'Tentar de novo', () => startLevel(level, 'level'), 262, 478, 245, 80);
        p.button('Fases', () => showScreen('levels'), 517, 478, 245, 80);
        p.button('Menu principal', () => goMenu(), 262, 576, 500, 78);
      }
    } else if (name === 'initials') {
      p.title('Novo recorde!', 70, 60);
      p.text(`${pad6(arcade.score)} pontos  ·  ${arcade.rank + 1}º lugar`, 512, 140, { size: 34, bold: true, color: UI.star });
      p.text('Escolha suas 3 letras', 512, 190, { size: 26, color: UI.dim });
      for (let k = 0; k < 3; k++) {
        const x = 292 + k * 160;
        p.button('▲', () => { arcade.letters[k] = (arcade.letters[k] + 1) % LETTERS.length; showScreen('initials'); }, x, 220, 120, 70, { size: 36 });
        p.text(LETTERS[arcade.letters[k]], x + 60, 345, { size: 96, bold: true, color: k === arcade.slot && !vr ? UI.text : UI.edge });
        p.button('▼', () => { arcade.letters[k] = (arcade.letters[k] + LETTERS.length - 1) % LETTERS.length; showScreen('initials'); }, x, 400, 120, 70, { size: 36 });
      }
      p.button('Gravar', () => {
        const nm = arcade.letters.map(i => LETTERS[i]).join('');
        save.name = nm;
        addScore(save, nm, arcade.score, arcade.reached);
        storeSave(save);
        app = 'done';
        updateHint();
        showScreen('scores');
      }, 262, 520, 500, 90, { size: 40 });
      p.text(vr ? 'Aponte e aperte o gatilho' : 'Teclado: digite as letras (Enter grava)', 512, 650, { size: 22, color: UI.dim });
    }
  });
}

function placePanel() {
  if (renderer.xr.isPresenting) {
    if (panel.mesh.parent !== scene) scene.add(panel.mesh);
    panel.mesh.scale.setScalar(0.62);
    const e = new THREE.Euler().setFromQuaternion(xrHeadQuat(), 'YXZ');
    const head = xrHeadPos();
    panel.mesh.position.set(head.x - Math.sin(e.y) * 0.55, head.y - 0.06, head.z - Math.cos(e.y) * 0.55);
    panel.mesh.rotation.set(0, e.y, 0);
    return;
  }
  if (panel.mesh.parent !== camera) camera.add(panel.mesh);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const visH = 2 * 0.8 * Math.tan(half), visW = visH * camera.aspect;
  panel.mesh.position.set(0, 0, -0.8);
  panel.mesh.rotation.set(0, 0, 0);
  panel.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 0.9, visH * 0.92 / 0.633));
}

function finishLevel() {
  const r = game.result;
  lastResult = r;
  const prev = save.done[level];
  newRecord = false;
  if (r.won) {
    newRecord = !!prev && r.score > prev.score;
    save.done[level] = { stars: Math.max(r.stars, prev?.stars || 0), score: Math.max(r.score, prev?.score || 0), time: Math.min(r.time, prev?.time ?? 1e9) };
    storeSave(save);
  }
  if (mode === 'arcade') {
    arcade.score += r.score;
    arcade.counted = true;
    arcade.lives = r.lives + (r.won && LEVELS[level].boss ? 1 : 0);
    arcade.reached = r.won ? level + 2 : level + 1;
    if (!r.won || level === LEVELS.length - 1) {
      arcade.over = true;
      arcade.rank = rankOf(save, arcade.score);
      if (arcade.rank >= 0) {
        arcade.letters = [...(save.name || 'AAA')].map(ch => Math.max(0, LETTERS.indexOf(ch)));
        arcade.slot = 0;
        app = 'initials';
        showScreen('initials');
        for (let k = 0; k < r.stars; k++) setTimeout(() => sfx.star(k), 300 + k * 220);
        updateHint();
        return;
      }
    }
  }
  app = 'done';
  showScreen('done');
  for (let k = 0; k < r.stars; k++) setTimeout(() => sfx.star(k), 300 + k * 220);
  updateHint();
}

// ---------- Terrário na mão ----------
let tankHolder = null, tankBack = 0;
function tankHome() {
  if (tankHolder) { scene.attach(tank); tankHolder = null; }
  tankBack = 1;
}
function nearTank(pos) {
  const l = tank.worldToLocal(pos.clone());
  return Math.abs(l.x) < W * CELL / 2 + 0.07 && Math.abs(l.y) < H * CELL / 2 + 0.07 && Math.abs(l.z) < TANK.depth / 2 + 0.07;
}

// ---------- Controles do VR ----------
const ctrls = [];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  const hand = renderer.xr.getHand(i);
  rig.add(ctrl); rig.add(grip); rig.add(hand);
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffb43a }));
  laser.visible = false;
  ctrl.add(laser);
  // ponta do controle: uma bolinha 5 cm à frente (é ela que guia a formiga)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe05a' }));
  tip.position.set(0, 0, -0.05);
  ctrl.add(tip);
  const entry = { ctrl, grip, hand, laser, tip, source: null, side: null, prevButtons: [], hoverIndex: -1 };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness; tip.visible = !e.data.hand; });
  ctrl.addEventListener('disconnected', () => { entry.source = null; entry.side = null; });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
  ctrl.addEventListener('squeezestart', () => {
    sfx.unlock();
    entry.grip.getWorldPosition(_v);
    if (nearTank(_v) && !tankHolder) { tankHolder = entry; entry.grip.attach(tank); tankBack = 0; sfx.grab(_v.toArray()); pulse(entry.side, 0.4, 30); }
  });
  ctrl.addEventListener('squeezeend', () => {
    if (tankHolder !== entry) return;
    scene.attach(tank); tankHolder = null;
    if (tank.position.distanceTo(TANK_HOME) < 0.25) tankBack = 1;
    sfx.glass(tank.position.toArray());
  });
}
const entryFor = (side) => ctrls.find(e => e.side === side && e.source);
function pulse(side, v, ms) {
  try { entryFor(side)?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ }
}
const both = (v, ms) => { pulse('left', v, ms); pulse('right', v, ms); };
function onSelect(entry) {
  sfx.unlock();
  if (panel.visible && entry.hoverIndex >= 0) { const a = panel.actionAt(entry.hoverIndex); if (a) { sfx.click(); a(); } return; }
  if (app === 'playing' && !panel.visible) pumpQueued = true;     // gatilho ou pinça: bomba
}
function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prevButtons[5] && (app === 'playing' || app === 'paused')) togglePause();   // B ou Y
    if (b[4] && !e.prevButtons[4] && app === 'playing' && !panel.visible) pumpQueued = true;  // A ou X
    e.prevButtons = b;
  }
}
// a ponta de quem está mais perto do vidro guia a formiga
function vrFinger() {
  let best = null, bz = 0.07;
  for (const e of ctrls) {
    if (!e.source || e === tankHolder) continue;
    let p = null;
    const tipJoint = e.hand?.joints?.['index-finger-tip'];
    if (e.source.hand && tipJoint) p = tipJoint.getWorldPosition(_v);
    else if (!e.source.hand) p = e.tip.getWorldPosition(_v);
    if (!p) continue;
    const l = tankView.root.worldToLocal(p.clone());
    if (Math.abs(l.z) < bz && Math.abs(l.x) < W * CELL / 2 + CELL && Math.abs(l.y) < H * CELL / 2 + CELL) { bz = Math.abs(l.z); best = posCell(l.x, l.y); }
  }
  return best;
}

// ---------- VR: sessão e recentralizar ----------
let recenterIn = 0;
function xrHeadPos() { return renderer.xr.isPresenting ? renderer.xr.getCamera().getWorldPosition(new THREE.Vector3()) : camera.getWorldPosition(new THREE.Vector3()); }
function xrHeadQuat() { return renderer.xr.isPresenting ? renderer.xr.getCamera().getWorldQuaternion(new THREE.Quaternion()) : camera.getWorldQuaternion(new THREE.Quaternion()); }
function recenter() {
  if (!renderer.xr.isPresenting) return;
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  rig.position.set(-head.x, 0, -head.z);
  if (panel.visible) placePanel();
}
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 6;
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  if (app === 'menu') goMenu();
  if (panel.visible) setTimeout(placePanel, 150);
  updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  tankHome();
  if (app === 'menu') goMenu();
  if (panel.visible) placePanel();
  onResize();
  updateHint();
});

// ---------- Mouse e teclado (PC) ----------
const mouse = { ndc: new THREE.Vector2(0, 0), has: false };
const keys = new Set();
const raycaster = new THREE.Raycaster();
const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouse.has = true;
  raycaster.setFromCamera(mouse.ndc, camera);
  if (panel.visible) {
    const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv));
    if (a) { sfx.click(); a(); }
    return;
  }
  if (app === 'playing') pumpQueued = true;
});
canvas.addEventListener('pointermove', (e) => {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouse.has = true;
});
window.addEventListener('blur', () => { keys.clear(); });
const KEYMAP = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };
let lastKey = null;
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
  if (app === 'initials') {
    if (/^[a-z0-9]$/.test(k)) { arcade.letters[arcade.slot] = LETTERS.indexOf(k.toUpperCase()); arcade.slot = (arcade.slot + 1) % 3; showScreen('initials'); }
    else if (k === 'enter') panel.buttons.at(-1)?.action?.();
    return;
  }
  if (KEYMAP[k]) { keys.add(k); lastKey = k; }
  if (e.repeat) return;
  if (k === ' ' && app === 'playing') pumpQueued = true;
  if (k === 'escape' || k === 'p') { if (app === 'playing' || app === 'paused') togglePause(); return; }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); return; }
});
window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (panel.visible) placePanel();
}
window.addEventListener('resize', onResize);
function mouseCell() {
  if (!mouse.has) return null;
  raycaster.setFromCamera(mouse.ndc, camera);
  const hit = raycaster.intersectObject(hitPlane)[0];
  if (!hit) return null;
  const l = tankView.root.worldToLocal(hit.point.clone());
  return posCell(l.x, l.y);
}

// ---------- Entrada para o jogo ----------
let keyDir = null;
function buildInput() {
  if (dev.autoplay || demo) { const r = robot.step(game); fingerCell = [r.tx, r.ty]; return r; }
  const pump = pumpQueued; pumpQueued = false;
  if (keyDir) { fingerCell = null; return { dir: keyDir, pump }; }
  return { tx: fingerCell ? fingerCell[0] : null, ty: fingerCell ? fingerCell[1] : null, pump };
}

function updatePcCamera() {
  if (renderer.xr.isPresenting) return;
  camera.position.copy(PC_CAM);
  camera.lookAt(TANK_HOME.x, TANK_HOME.y + 0.03, TANK_HOME.z);
}

// ---------- Raios do menu ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateMenuRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    e.laser.visible = false;
    if (!vr || !e.source || !panel.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(_q);
    rayDir.set(0, 0, -1).applyQuaternion(_q);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.visible = true;
    e.laser.scale.z = hit ? hit.distance : 0.6;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr && panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
    canvas.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
  } else if (!vr) canvas.style.cursor = app === 'playing' ? 'crosshair' : 'default';
  if (panel.visible) panel.setHover(hover);
}

// ---------- HUD ----------
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');
const msgEl = document.getElementById('msg');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  hintEl.innerHTML = app === 'playing'
    ? '<span>Mouse no formigueiro (ou setas/WASD): a formiga vai até lá · Clique ou espaço: bomba de ar · Esc: pausa</span>'
    : app === 'initials' ? '<span>Digite as 3 letras e aperte Enter</span>' : '<span>Clique nas opções do painel</span>';
}
function updateBoard() {
  if (!game || app === 'menu') {
    const best = save.scores[0];
    world.setBoard([
      { text: 'FORMIGUEIRO', x: 26, size: 56, color: '#ffb43a' },
      { text: best ? `REC ${best.name} ${pad6(best.score)}` : 'INSIRA FICHA', x: 1000, align: 'right', size: 42, color: '#8ad05a' },
    ]);
    return;
  }
  const score = mode === 'arcade' ? arcade.score + (arcade.counted ? 0 : game.score) : game.score;
  const L = LEVELS[level];
  let left = `FASE ${level + 1}`;
  if (game.bossE?.alive) { const mx = BOSS[game.boss].hp; left = `CHEFE ${'■'.repeat(game.bossE.hp)}${'□'.repeat(mx - game.bossE.hp)}`; }
  world.setBoard([
    { text: left, x: 26, size: 46, color: L.boss ? '#ff6ab8' : '#8ad05a' },
    { text: pad6(score), x: 600, align: 'center', size: 70, color: '#ffb43a' },
    { text: '♥'.repeat(Math.max(0, game.lives)), x: 1000, align: 'right', size: 56, color: '#ff5a6a' },
  ]);
}
function updateHud(dt) {
  const vr = renderer.xr.isPresenting;
  const playing = (app === 'playing' || app === 'done' || app === 'paused') && !!game && !demo;
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  updateBoard();
  if (!vr) {
    msgLabel.mesh.visible = false;
    hudEl.style.display = playing ? 'block' : 'none';
    if (playing) {
      const L = LEVELS[level];
      const html = `<b>${level + 1}. ${L.name}</b><br><em>${WORLDS[L.world].name}${mode === 'arcade' ? ' · fliperama' : ''}</em>`
        + `<div>Tempo ${Math.floor(game.result?.time ?? game.t)} s · vidas ${game.lives} · ${leftText()}</div>`
        + (game.fruit ? '<div style="color:#ff6a7a">Frutinha no começo do túnel!</div>' : '');
      if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
    }
    const mtxt = msg && playing ? msg.text : '';
    if (msgEl.dataset.last !== mtxt) { msgEl.textContent = mtxt; msgEl.style.color = msg?.color || '#fff'; msgEl.dataset.last = mtxt; }
    msgEl.style.display = mtxt ? 'block' : 'none';
    return;
  }
  hudEl.style.display = msgEl.style.display = 'none';
  msgLabel.mesh.visible = playing && !!msg;
  if (!playing) return;
  const hp = xrHeadPos(), hq = xrHeadQuat();
  const fwd = _v.set(0, 0, -1).applyQuaternion(hq);
  const up = _v2.set(0, 1, 0).applyQuaternion(hq);
  const k = Math.min(1, dt * 2.5);
  const tgt = hp.clone().addScaledVector(fwd, 0.5).addScaledVector(up, 0.2);
  msgLabel.mesh.position.lerp(tgt, msgLabel.mesh.visible ? k : 1);
  msgLabel.mesh.lookAt(hp);
  if (msg) msgLabel.set([{ text: msg.text, size: 0.62, color: msg.color, bold: false }]);
}

// ---------- Eventos do jogo -> som, vibração, avisos, efeitos ----------
function handleEvents(evs) {
  const quiet = demo;
  const th = THEMES[LEVELS[level].world];
  for (const ev of evs) {
    const at = ev.x !== undefined ? tankView.worldOf(ev.x, ev.y) : tankView.worldOf(game.ant.x, game.ant.y);
    switch (ev.type) {
      case 'dig': if (Math.random() < 0.5) particles.burst(at, th.layers[1], 3, 0.04, 0.4, 0.003, 0.15); if (!quiet) sfx.dig(at); break;
      case 'pump': {
        const a = game.ant; tankView.pumpShot(game, Math.hypot(ev.x - a.x, ev.y - a.y));
        if (!quiet) { sfx.pump(at, ev.inflate); pulse('left', 0.25, 20); pulse('right', 0.25, 20); }
        break;
      }
      case 'pump-miss': tankView.pumpShot(game, 1.2); if (!quiet) sfx.pumpMiss(at); break;
      case 'pump-block': tankView.pumpShot(game, Math.hypot(ev.x - game.ant.x, ev.y - game.ant.y)); if (!quiet) sfx.block(at); break;
      case 'pump-angry': if (!quiet) { sfx.block(at); if (!msg) showMsg('Ele está bravo: a bomba não segura!', 1.4, '#ff6a5a'); } break;
      case 'rhino-angry': if (!quiet) { sfx.angry(at); showMsg('O rinoceronte ficou bravo! Fuja e use as pedras', 2, '#ff6a5a'); } break;
      case 'deflate': if (!quiet) sfx.deflate(at); break;
      case 'pop': particles.burst(at, '#ffffff', 22, 0.12, 0.5, 0.005, 0.05); particles.burst(at, ev.kind === 'fire' ? '#ff8a3a' : '#5ad0a0', 16, 0.1, 0.6, 0.005, 0.1); if (!quiet) { sfx.pop(at); both(0.5, 50); } break;
      case 'die':
        particles.burst(at, '#ff5a3a', 20, 0.08, 0.6, 0.005, 0.1);
        if (!quiet) { sfx.die(at); both(0.9, 250); showMsg(`${WHY[ev.why] || 'Ai!'} ${ev.lives > 0 ? (ev.lives === 1 ? 'Última vida!' : `Restam ${ev.lives} vidas`) : ''}`, 2.4, '#ff5a6a'); }
        break;
      case 'respawn': if (!quiet) sfx.respawn(); break;
      case 'ghost': if (!quiet) sfx.ghost(at); break;
      case 'unghost': if (!quiet) sfx.unghost(at); break;
      case 'fire-warn': if (!quiet) sfx.fireWarn(at); break;
      case 'fire': if (!quiet) sfx.fire(at); for (let k = 0; k < 12; k++) particles.spawn(at[0], at[1], at[2], (Math.random() - 0.5) * 0.05 + (ev.face || 1) * 0.08, Math.random() * 0.04, 0, 0.5, 0.005, '#ffb43a', -0.05); break;
      case 'egg': if (!quiet) { sfx.egg(at); showMsg('A Lagartona deixou um ovo!', 1.6, '#ff8a3a'); } break;
      case 'web': if (!quiet) { sfx.web(at); showMsg('Ela parou para tecer: bombeie agora!', 1.6, '#5ae8ff'); } break;
      case 'flee': if (!quiet) { sfx.flee(); sfx.lastOne = true; showMsg('O último está fugindo para a superfície!', 2, '#ffd24a'); } break;
      case 'escape': if (!quiet) { sfx.escape(); showMsg('Escapou... (sem os pontos dele)', 1.6, '#c8b49a'); } break;
      case 'rock-wobble': if (!quiet) sfx.wobble(at); break;
      case 'rock-fall': if (!quiet) sfx.rockFall(at); break;
      case 'rock-land': particles.burst(at, '#a8a8b0', 18, 0.08, 0.6, 0.006, 0.2); if (!quiet) { sfx.rockLand(at, ev.crushed); if (ev.crushed) { both(0.6, 80); showMsg(ev.crushed > 1 ? `${ev.crushed} esmagados de uma vez! +${ev.pts}` : `Esmagado! +${ev.pts}`, 1.6, '#ffd24a'); } } break;
      case 'rock-break': particles.burst(at, '#8a8a90', 10, 0.05, 0.4, 0.005, 0.2); break;
      case 'rock-new': if (!quiet) sfx.rockNew(at); break;
      case 'crush': particles.burst(at, '#ffffff', 14, 0.1, 0.4, 0.005, 0.1); if (!quiet) sfx.crush(at); break;
      case 'fruit': if (!quiet) { sfx.fruit(at); showMsg('Apareceu uma frutinha no começo do túnel!', 2, '#ff6a7a'); } break;
      case 'fruit-get': particles.burst(at, '#ff5a6a', 18, 0.08, 0.6, 0.005, 0.05); if (!quiet) { sfx.fruitGet(at); showMsg(`Frutinha! +${ev.pts}`, 1.4, '#ff6a7a'); } break;
      case 'boss-hit': particles.burst(at, '#ffd24a', 24, 0.12, 0.6, 0.006, 0.05); if (!quiet) { sfx.bossHit(at); both(0.6, 100); if (ev.hp > 0) showMsg(`${BOSS_NAME[ev.kind]}: falta${ev.hp > 1 ? 'm' : ''} ${ev.hp}!`, 1.8, '#ffd24a'); } break;
      case 'boss-down':
        for (let k = 0; k < 6; k++) later.push({ t: time + k * 0.2, fn: () => particles.burst(tankView.worldOf(Math.random() * W, 1 + Math.random() * (H - 2)), ['#ffb43a', '#ff6ab8', '#8ad05a'][k % 3], 24, 0.12, 0.8, 0.006, 0.05) });
        if (!quiet) { sfx.bossDown(at); showMsg(`${BOSS_NAME[ev.kind]} derrotado!`, 3, '#ffb43a'); }
        break;
      case 'won': if (!quiet) { sfx.won(); doneTimer = 2.4; showMsg('Formigueiro limpo!', 2.4, '#ffb43a'); } sfx.lastOne = false; break;
      case 'lost': if (!quiet) { sfx.lost(); both(1, 400); doneTimer = 2.5; showMsg('Acabaram as vidas...', 2.5, '#ff5a6a'); } sfx.lastOne = false; break;
    }
  }
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const okXR = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!okXR) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let acc = 0, lastT = performance.now(), time = 0;
let fpsFrames = 0, fpsTime = 0;
const later = [];
const _lf = new THREE.Vector3(), _lu = new THREE.Vector3();
const homeQ = new THREE.Quaternion();

function tick(dt) {
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) recenter();
  pollButtons();
  rig.updateMatrixWorld(true);
  updatePcCamera();
  camera.updateMatrixWorld(true);
  // terrário voltando para o banquinho
  if (tankBack > 0 && !tankHolder) {
    const k = Math.min(1, dt * 6);
    tank.position.lerp(TANK_HOME, k);
    tank.quaternion.slerp(homeQ, k);
    if (tank.position.distanceTo(TANK_HOME) < 0.002) { tank.position.copy(TANK_HOME); tank.quaternion.identity(); tankBack = 0; }
  }
  tank.updateMatrixWorld(true);
  // de onde vem o alvo da formiga
  keyDir = null;
  if (!vr) {
    for (const k of [lastKey, ...keys]) if (k && keys.has(k)) { keyDir = KEYMAP[k]; break; }
    if (!dev.autoplay && !demo) fingerCell = keyDir ? null : mouseCell();
  } else if (!dev.autoplay && !demo) fingerCell = vrFinger();
  world.grabGlow.material.opacity = vr && !tankHolder && ctrls.some(e => e.source && (e.grip.getWorldPosition(_v2), nearTank(_v2))) ? 0.35 : 0;

  const running = app === 'playing' || app === 'done' || app === 'menu' || app === 'initials';
  if (running) {
    acc += dt;
    const n = Math.min(12, Math.floor(acc / DT));
    for (let i = 0; i < n; i++) {
      game.step(buildInput());
      handleEvents(game.events);
    }
    acc -= n * DT;
    if (demo && game.over) newGame(Math.floor(Math.random() * LEVELS.length), { seed: Math.floor(Math.random() * 1e6) });
  } else acc = 0;
  if (app === 'playing' && doneTimer > 0) { doneTimer -= dt; if (doneTimer <= 0) finishLevel(); }
  for (let i = later.length - 1; i >= 0; i--) if (time >= later[i].t) { later[i].fn(); later.splice(i, 1); }
  if (!demo && app === 'playing' && game.ant.moving) sfx.step1(tankView.worldOf(game.ant.x, game.ant.y));

  // visual
  tankView.update(game, app === 'paused' ? 0 : dt, time, app === 'playing' || demo ? (game.ant.hand || fingerCell) : null);
  if (app !== 'paused') particles.update(dt);
  particles.mat.uniforms.uScale.value = vr ? 800 : renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  world.update(app === 'paused' ? 0 : dt, time);
  updateHud(dt);
  updateMenuRays();

  if (sfx.ctx) {
    const hq = xrHeadQuat();
    sfx.setListener(xrHeadPos(), _lf.set(0, 0, -1).applyQuaternion(hq), _lu.set(0, 1, 0).applyQuaternion(hq));
  }

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  renderer.render(scene, camera);
}

// ---------- Depuração (console do navegador) ----------
// dev.loadLevel(5)      abre a fase 5 (1 a 12)
// dev.autoplay = true   o robô joga (limites humanos)
// dev.advance(20)       avança 20 s de jogo na hora, sem esperar a animação
// dev.state()           resumo: tela, fase, vidas, pontos, formiga, bichos, pedras, chefe
// dev.snapshot()        imagem da tela (JPEG em data URL)
// dev.arcade()          começa o fliperama
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; robot.reset(); updateHint(); },
  loadLevel(n) { startLevel(clamp(n, 1, LEVELS.length) - 1, 'level'); return this.state(); },
  arcade() { startArcade(); return this.state(); },
  advance(sec, step = 1 / 72) {
    const frames = Math.round(sec / step);
    for (let i = 0; i < frames; i++) tick(step);
    lastT = performance.now();
    renderer.render(scene, camera);
    return this.state();
  },
  state() {
    const a = game.ant;
    return {
      tela: app, modo: mode, fase: level + 1, nome: LEVELS[level].name, mundo: WORLDS[LEVELS[level].world].name,
      tempo: +game.t.toFixed(1), vidas: game.lives, pontos: game.score, fliperama: mode === 'arcade' ? arcade.score : null,
      formiga: { x: +a.x.toFixed(2), y: +a.y.toFixed(2), olhando: a.face, mangueira: a.hose },
      bichos: game.alive().map(e => `${e.kind}:${e.mode}${e.inflate ? ' inflado ' + e.inflate : ''}(${e.x.toFixed(1)},${e.y.toFixed(1)})`),
      pedras: game.rocks.map(r => `${r.state}(${r.x},${r.y})`), faltam: leftText(),
      chefe: game.bossE ? { nome: BOSS_NAME[game.boss], vida: game.bossE.hp } : null,
      resultado: game.result, salvo: save.done[level] || null,
    };
  },
  snapshot(w = 960) {
    renderer.render(scene, camera);
    const src = renderer.domElement, c = document.createElement('canvas');
    c.width = w; c.height = Math.round(w * src.height / src.width);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  },
  resetSave() { save.done = {}; save.scores = []; storeSave(save); },
};
window.dev = dev;
window.formigueiro = { dev, get game() { return game; }, save, sfx, robot, startLevel, startArcade, goMenu, camera, scene, renderer, ANT };

goMenu();
renderer.setAnimationLoop(frame);
