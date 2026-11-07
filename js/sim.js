// Regras do Formigueiro: a grade de terra, a formiga que segue o dedo cavando, a bomba de ar que
// infla e estoura, besouros (que viram fantasma e atravessam a terra), lagartas-de-fogo, pedras
// que caem e esmagam, a frutinha, os chefes, vidas, pontos e estrelas.
// Sem navegador e sem Three.js (os testes rodam no Node).
// Coordenadas da grade: x = coluna (0 a 13, esquerda para direita), y = linha (0 = superfície, 11 =
// fundo, para baixo). Posições contínuas em casas; centro da casa = números inteiros.
import { Rng, clamp } from './vec.js';
import { LEVELS, W, H, starsFor } from './levels.js';

export const DT = 1 / 120;
export const CELL = 0.035;                       // m por casa (terrário de 49 x 42 cm)
export const TANK = { w: W * CELL, h: H * CELL, depth: 0.05 };
export const DIRT = 0, DUG = 1, ROCK = 2, ROOT = 3;
export const ANT = { speed: 3.2, dig: 2.3, range: 3, cool: 0.15, hit: 0.55, dead: 0.3, invuln: 2, dieTime: 1.8 };
export const PUMP = { pops: 4, wait: 0.7, every: 0.55 };
export const ROCKF = { wobble: 0.9, fall: 7, stay: 0.6 };
export const FIRE = { warn: 0.75, len: 3, on: 0.6 };
export const GHOST = { speed: 1.3, min: 1.2 };
export const BOSS = {
  rhino: { hp: 2, freeze: 1.6, speed: 2.2, tire: 4, angry: 4 },
  queen: { hp: 4, pumps: 6, fire: 4, speed: 1.8 },
  spider: { hp: 3, pumps: 5, speed: 1.15, every: 5, weave: 2.5 },
};
export const LIVES = 3, DEATH_PENALTY = 20, FLEE_AFTER = 2;
export const KIND_OF = { b: 'beetle', f: 'fire', K: 'rhino', Q: 'queen', S: 'spider' };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CRUSH_PTS = [0, 1000, 2500, 4000, 6000, 8000];

export function parseLevel(L) {
  const cells = new Uint8Array(W * H);
  const rocks = [], enemies = [];
  let start = [7, 0];
  L.map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const i = y * W + x;
      if (y === 0 || ch === '.' || ch === ' ' || ch === 'A' || KIND_OF[ch]) cells[i] = DUG;
      else if (ch === 'o') { cells[i] = ROCK; rocks.push({ x, y }); }
      else if (ch === 'x') cells[i] = ROOT;
      else cells[i] = DIRT;
      if (ch === 'A') start = [x, y];
      if (KIND_OF[ch]) enemies.push({ kind: KIND_OF[ch], x, y });
    });
  });
  return { cells, rocks, enemies, start };
}

export class Game {
  constructor(level, opts = {}) {
    this.level = level;
    const L = (this.L = LEVELS[level]);
    this.rng = new Rng(opts.seed ?? 1);
    this.dt = opts.dt || DT;
    this.lives = opts.lives ?? LIVES;
    this.t = 0; this.score = 0; this.events = []; this.phase = 'play'; this.over = false; this.result = null;
    this.livesLost = 0; this.nextId = 1; this.dieT = 0;
    const P = parseLevel(L);
    this.cells = P.cells;
    this.start = P.start;
    this.dugVer = 0;
    this.rocks = P.rocks.map(r => ({ id: this.nextId++, x: r.x, y: r.y, fy: r.y, state: 'rest', t: 0, crushed: 0 }));
    this.rocksDropped = 0;
    this.fruit = null; this.fruitDone = false;
    this.boss = L.boss || null;
    this.enemies = P.enemies.map(e => this.makeEnemy(e.kind, e.x, e.y));
    this.bossE = this.enemies.find(e => e.kind === this.boss) || null;
    this.lastT = 0;
    this.ant = this.makeAnt();
    this.maps = {};
  }

  makeAnt() {
    const [x, y] = this.start;
    return { x, y, dir: null, axis: 0, face: [0, 1], moving: false, cool: 0, hose: null, inv: this.t > 0 ? ANT.invuln : 0, alive: true, hand: null };
  }
  makeEnemy(kind, x, y) {
    const L = this.L;
    const e = {
      id: this.nextId++, kind, x, y, sx: x, sy: y, tx: x, ty: y, px: x, py: y, mode: kind === 'spider' ? 'ghost' : 'walk',
      inflate: 0, lastPump: -9, deflT: 0, frozen: 0, hidden: 0, alive: true, flee: false, stuck: 0, ghostAge: 0,
      ghostAt: this.t + this.rng.range(L.ghost[0], L.ghost[1]) * (kind === 'beetle' ? 1 : 1.3),
      fireT: this.t + this.rng.range(1.5, L.fire), fireWarn: 0, fireOn: 0, fireCells: [], face: 1,
      speed: L.speed * (kind === 'fire' ? 0.85 : 1), hp: 1, weave: 0, weaveAt: this.t + 3,
    };
    if (BOSS[kind]) { e.hp = BOSS[kind].hp; e.speed = BOSS[kind].speed; }
    return e;
  }

  // ---------- grade ----------
  cell(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? -1 : this.cells[y * W + x]; }
  open(x, y) { return this.cell(x, y) === DUG; }
  antCan(x, y) { const c = this.cell(x, y); return c === DUG || c === DIRT; }
  dig(x, y) {
    const i = y * W + x;
    if (this.cells[i] !== DIRT) return;
    this.cells[i] = DUG;
    this.dugVer++;
    this.score += 10;
    this.events.push({ type: 'dig', x, y });
  }
  // distâncias pelos túneis até uma casa (BFS), guardadas até a grade mudar
  distMap(tx, ty) {
    const key = `${tx},${ty}`;
    const m = this.maps[key];
    if (m && m.ver === this.dugVer) return m.d;
    const d = new Float32Array(W * H).fill(Infinity);
    if (this.open(tx, ty)) {
      const q = [ty * W + tx];
      d[q[0]] = 0;
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i - x) / W;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (!this.open(nx, ny)) continue;
          const j = ny * W + nx;
          if (d[j] === Infinity) { d[j] = d[i] + 1; q.push(j); }
        }
      }
    }
    this.maps[key] = { ver: this.dugVer, d };
    return d;
  }

  alive() { return this.enemies.filter(e => e.alive); }
  harmful(e) { return e.alive && e.hidden <= 0 && e.inflate === 0 && e.frozen <= 0; }
  pumpable(e) { return e.alive && e.hidden <= 0 && (e.kind === 'spider' ? e.weave > 0 : e.mode === 'walk'); }
  layerPts(y) { return y <= 3 ? 200 : y <= 6 ? 300 : y <= 9 ? 400 : 500; }

  // ---------- passo ----------
  step(inp = {}) {
    this.events = [];
    if (this.over) return;
    const dt = this.dt;
    this.t += dt;
    if (this.phase === 'dying') {
      this.dieT -= dt;
      this.stepRocks(dt);
      if (this.dieT <= 0) this.respawn();
      return;
    }
    this.stepAnt(inp, dt);
    this.stepPump(inp, dt);
    for (const e of this.enemies) if (e.alive) this.stepEnemy(e, dt);
    this.stepRocks(dt);
    this.stepFlee(dt);
    this.collide();
    this.checkEnd();
  }

  stepAnt(inp, dt) {
    const a = this.ant;
    a.inv = Math.max(0, a.inv - dt);
    a.moving = false;
    let tx = null, ty = null;
    if (inp.dir && (inp.dir[0] || inp.dir[1])) { tx = a.x + inp.dir[0] * 2; ty = a.y + inp.dir[1] * 2; }
    else if (inp.tx !== undefined && inp.tx !== null) { tx = inp.tx; ty = inp.ty; }
    a.hand = tx === null ? null : [tx, ty];
    let pri = null, sec = null;
    if (tx !== null) {
      const dx = tx - a.x, dy = ty - a.y;
      const ax = Math.abs(dx) > ANT.dead ? [Math.sign(dx), 0] : null, ay = Math.abs(dy) > ANT.dead ? [0, Math.sign(dy)] : null;
      if (Math.abs(dx) >= Math.abs(dy)) { pri = ax; sec = ay; } else { pri = ay; sec = ax; }
    }
    const cx = Math.round(a.x), cy = Math.round(a.y);
    const atC = Math.abs(a.x - cx) < 1e-6 && Math.abs(a.y - cy) < 1e-6;
    let dir = null;
    if (atC) {
      a.x = cx; a.y = cy;
      for (const c of [pri, sec]) if (c && this.antCan(cx + c[0], cy + c[1])) { dir = c; break; }
      if (dir) a.digging = this.cell(cx + dir[0], cy + dir[1]) === DIRT;
    } else {
      // no meio da casa só anda no eixo em que estava (vai até o centro para virar)
      const ax = Math.abs(a.x - cx) > 1e-6 ? 0 : 1;
      const along = [pri, sec].find(c => c && c[ax === 0 ? 0 : 1] !== 0);
      if (along) dir = along;
      else if (pri || sec) dir = a.dir && a.dir[ax === 0 ? 0 : 1] !== 0 ? a.dir : (ax === 0 ? [Math.sign(cx - a.x) || 1, 0] : [0, Math.sign(cy - a.y) || 1]);
      // voltou para trás: a casa de onde veio já está aberta
      if (dir && a.dir && (dir[0] === -a.dir[0] && dir[1] === -a.dir[1]) && (dir[0] || dir[1])) a.digging = false;
    }
    a.dir = dir;
    if (!dir) return;
    a.face = dir;
    // centro seguinte na direção
    let nx, ny;
    if (atC) { nx = cx + dir[0]; ny = cy + dir[1]; }
    else if (dir[0]) { nx = dir[0] > 0 ? Math.ceil(a.x - 1e-9) : Math.floor(a.x + 1e-9); ny = cy; }
    else { ny = dir[1] > 0 ? Math.ceil(a.y - 1e-9) : Math.floor(a.y + 1e-9); nx = cx; }
    if (!this.antCan(nx, ny)) return;
    const sp = (a.digging ? ANT.dig : ANT.speed) * dt;
    const d = Math.abs(nx - a.x) + Math.abs(ny - a.y);
    if (d <= sp) { a.x = nx; a.y = ny; } else { a.x += dir[0] * sp; a.y += dir[1] * sp; }
    a.moving = true;
    this.dig(Math.round(a.x), Math.round(a.y));
  }

  stepPump(inp, dt) {
    const a = this.ant;
    a.cool = Math.max(0, a.cool - dt);
    // a mangueira solta se ele sair da linha
    if (a.hose) {
      const e = this.enemies.find(q => q.id === a.hose);
      if (!e || !this.inLine(e)) a.hose = null;
    }
    if (inp.pump && a.cool <= 0) {
      a.cool = ANT.cool;
      let e = a.hose ? this.enemies.find(q => q.id === a.hose) : null;
      if (!e) e = this.scan();
      if (!e) { this.events.push({ type: 'pump-miss', x: a.x, y: a.y, face: a.face }); return; }
      a.hose = e.id;
      if (e.kind === 'rhino') {
        // o chifre não deixa inflar: a bomba só segura ele parado um pouco (e ele cansa disso)
        if (e.angry > 0) { this.events.push({ type: 'pump-angry', x: e.x, y: e.y }); return; }
        e.frozen = BOSS.rhino.freeze;
        this.events.push({ type: 'pump-block', x: e.x, y: e.y });
        return;
      }
      e.inflate++; e.lastPump = this.t; e.deflT = 0;
      const need = BOSS[e.kind]?.pumps ?? PUMP.pops;
      this.events.push({ type: 'pump', x: e.x, y: e.y, id: e.id, inflate: e.inflate, need });
      if (e.inflate >= need) this.pop(e);
    }
    for (const e of this.enemies) {
      if (!e.alive || e.inflate <= 0) continue;
      if (this.t - e.lastPump > PUMP.wait) {
        e.deflT += dt;
        if (e.deflT >= PUMP.every) { e.deflT = 0; e.inflate--; this.events.push({ type: 'deflate', x: e.x, y: e.y, inflate: e.inflate }); }
      }
    }
  }
  inLine(e) {
    const a = this.ant, [fx, fy] = a.face;
    if (!this.pumpable(e) && e.inflate === 0 && e.frozen <= 0) return false;
    const along = (e.x - a.x) * fx + (e.y - a.y) * fy, perp = Math.abs((e.x - a.x) * fy - (e.y - a.y) * fx);
    return along > 0.2 && along <= ANT.range + 0.6 && perp < 0.55;
  }
  scan() {
    const a = this.ant, [fx, fy] = a.face;
    const cx = Math.round(a.x), cy = Math.round(a.y);
    for (let k = 0; k <= ANT.range; k++) {
      const x = cx + fx * k, y = cy + fy * k;
      if (!this.open(x, y)) break;
      const e = this.enemies.find(q => q.alive && (this.pumpable(q) || q.inflate > 0) && Math.abs(q.x - x) < 0.6 && Math.abs(q.y - y) < 0.6 && ((q.x - a.x) * fx + (q.y - a.y) * fy) > 0.2);
      if (e) return e;
    }
    return null;
  }
  pop(e) {
    const pts = Math.round(this.layerPts(Math.round(e.y)) * (e.kind === 'fire' ? 1.5 : 1));
    this.ant.hose = null;
    if (e.kind === 'queen' || e.kind === 'spider') {
      e.hp--;
      this.score += 1500;
      this.events.push({ type: 'boss-hit', kind: e.kind, x: e.x, y: e.y, hp: e.hp });
      if (e.hp <= 0) { e.alive = false; this.events.push({ type: 'boss-down', kind: e.kind, x: e.x, y: e.y }); return; }
      if (e.kind === 'queen') this.layEgg(e);
      this.bossRespawn(e);
      return;
    }
    e.alive = false;
    this.score += pts;
    this.events.push({ type: 'pop', kind: e.kind, x: e.x, y: e.y, pts });
  }
  // a Lagartona deixa um ovo: nasce uma lagarta-de-fogo onde ela estourou
  layEgg(e) {
    const x = Math.round(e.x), y = Math.round(e.y);
    const k = this.makeEnemy('fire', x, y);
    k.hidden = 1.5;
    this.enemies.push(k);
    this.events.push({ type: 'egg', x, y });
  }
  bossRespawn(e) {
    e.inflate = 0; e.frozen = 0; e.weave = 0; e.fireWarn = 0; e.fireOn = 0; e.fireCells = [];
    e.hidden = 2;
    if (e.kind === 'spider') {
      // volta para um canto lá em cima, longe da formiga
      e.x = this.ant.x < W / 2 ? W - 2 : 1; e.y = 1; e.mode = 'ghost'; e.weaveAt = this.t + 2 + BOSS.spider.every;
    } else {
      // volta para o começo dela (ou o canto mais longe), mais rápida
      const far = [[e.sx, e.sy], [1, H - 2], [W - 2, H - 2], [1, 2], [W - 2, 2]].filter(([x, y]) => this.open(x, y))
        .sort((p, q) => Math.hypot(q[0] - this.ant.x, q[1] - this.ant.y) - Math.hypot(p[0] - this.ant.x, p[1] - this.ant.y))[0];
      e.x = e.tx = far[0]; e.y = e.ty = far[1]; e.mode = 'walk';
      e.speed += e.kind === 'queen' ? 0.3 : 0;
    }
    e.ghostAt = this.t + this.rng.range(this.L.ghost[0], this.L.ghost[1]);
  }

  stepEnemy(e, dt) {
    const L = this.L, a = this.ant;
    e.px = e.x; e.py = e.y;
    if (e.hidden > 0) { e.hidden -= dt; return; }
    if (e.kind === 'rhino') {
      e.angry = Math.max(0, (e.angry || 0) - dt);
      if (e.frozen > 0) { e.frozenSum = (e.frozenSum || 0) + dt; if (e.frozenSum > BOSS.rhino.tire) { e.frozen = 0; e.frozenSum = 0; e.angry = BOSS.rhino.angry; this.events.push({ type: 'rhino-angry', x: e.x, y: e.y }); } }
    }
    if (e.frozen > 0) { e.frozen -= dt; return; }
    if (e.inflate > 0) return;
    // brasa da lagarta
    if (e.fireOn > 0) { e.fireOn -= dt; if (e.fireOn <= 0) e.fireCells = []; return; }
    if (e.fireWarn > 0) {
      e.fireWarn -= dt;
      if (e.fireWarn <= 0) {
        const len = e.kind === 'queen' ? BOSS.queen.fire : FIRE.len;
        const cx = Math.round(e.x), cy = Math.round(e.y);
        e.fireCells = [];
        for (let k = 1; k <= len; k++) { const x = cx + e.face * k; if (!this.open(x, cy)) break; e.fireCells.push([x, cy]); }
        e.fireOn = FIRE.on;
        e.fireT = this.t + L.fire * this.rng.range(0.8, 1.25) * (e.kind === 'queen' ? 0.85 : 1);
        this.events.push({ type: 'fire', x: e.x, y: e.y, face: e.face, cells: e.fireCells.length });
      }
      return;
    }
    if (e.kind === 'spider') { this.stepSpider(e, dt); return; }
    if (e.mode === 'ghost') {
      e.ghostAge += dt;
      const [gx, gy] = e.flee ? [0, 0] : [a.x, a.y];
      const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy) || 1;
      const sp = GHOST.speed * (e.flee ? 1.5 : 1) * dt;
      e.x = clamp(e.x + dx / d * Math.min(sp, d), 0, W - 1); e.y = clamp(e.y + dy / d * Math.min(sp, d), 0, H - 1);
      const cx = Math.round(e.x), cy = Math.round(e.y);
      if (e.ghostAge > GHOST.min && this.open(cx, cy) && Math.hypot(e.x - cx, e.y - cy) < 0.15) {
        e.x = e.tx = cx; e.y = e.ty = cy; e.mode = 'walk'; e.stuck = 0;
        e.ghostAt = this.t + this.rng.range(L.ghost[0], L.ghost[1]);
        this.events.push({ type: 'unghost', x: e.x, y: e.y, id: e.id });
      }
      return;
    }
    // andando pelos túneis
    let rem = e.speed * (e.flee ? 1.4 : 1) * dt;
    for (let guard = 0; guard < 3; guard++) {
      const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.abs(dx) + Math.abs(dy);
      if (d > rem) { e.x += Math.sign(dx) * rem; e.y += Math.sign(dy) * rem; if (dx) e.face = Math.sign(dx); rem = 0; break; }
      e.x = e.tx; e.y = e.ty; rem -= d;
      if (!this.chooseNext(e)) break;
    }
  }
  chooseNext(e) {
    const L = this.L, a = this.ant;
    // hora de virar fantasma?
    if (((!e.flee && this.t >= e.ghostAt) || e.stuck > (e.flee ? 1 : 3)) && e.kind !== 'queen') {
      e.mode = 'ghost'; e.ghostAge = 0;
      this.events.push({ type: 'ghost', x: e.x, y: e.y, id: e.id });
      return false;
    }
    // lagarta: solta brasa se a formiga estiver na mesma linha, perto
    if ((e.kind === 'fire' || e.kind === 'queen') && this.t >= e.fireT && Math.abs(a.y - e.y) < 1.5 && Math.abs(a.x - e.x) < 6) {
      e.face = Math.sign(a.x - e.x) || e.face;
      e.fireWarn = FIRE.warn;
      this.events.push({ type: 'fire-warn', x: e.x, y: e.y, face: e.face });
      return false;
    }
    const map = e.flee ? this.distMap(0, 0) : this.distMap(Math.round(a.x), Math.round(a.y));
    const cx = Math.round(e.x), cy = Math.round(e.y);
    const opts = DIRS.map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => this.open(x, y));
    if (!opts.length) { e.stuck += 0.5; return false; }
    const back = opts.filter(([x, y]) => x === e.lx && y === e.ly);
    const fwd = opts.length > 1 ? opts.filter(([x, y]) => !(x === e.lx && y === e.ly)) : back;
    let best = null, bv = Infinity;
    for (const [x, y] of opts) { const v = map[y * W + x]; if (v < bv) { bv = v; best = [x, y]; } }
    if (bv === Infinity) { best = fwd[Math.floor(this.rng.next() * fwd.length)] || opts[0]; e.stuck += 1 / Math.max(0.5, e.speed); }
    else e.stuck = 0;
    e.lx = cx; e.ly = cy;
    e.tx = best[0]; e.ty = best[1];
    if (e.tx !== cx) e.face = Math.sign(e.tx - cx);
    return true;
  }
  stepSpider(e, dt) {
    const a = this.ant, S = BOSS.spider;
    if (e.weave > 0) {
      e.weave -= dt;
      if (e.weave <= 0) { e.weaveAt = this.t + S.every; e.mode = 'ghost'; this.events.push({ type: 'web-end', x: e.x, y: e.y }); }
      return;
    }
    const dx = a.x - e.x, dy = a.y - e.y, d = Math.hypot(dx, dy) || 1;
    const sp = S.speed * dt;
    e.x = clamp(e.x + dx / d * Math.min(sp, d), 0, W - 1); e.y = clamp(e.y + dy / d * Math.min(sp, d), 1, H - 1);
    if (dx) e.face = Math.sign(dx);
    if (this.t >= e.weaveAt) {
      const cx = Math.round(e.x), cy = Math.round(e.y);
      if (this.open(cx, cy) && Math.hypot(e.x - cx, e.y - cy) < 0.2) {
        e.x = cx; e.y = cy; e.weave = S.weave; e.mode = 'walk';
        this.events.push({ type: 'web', x: e.x, y: e.y });
      }
    }
  }

  stepRocks(dt) {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      if (r.state === 'rest') {
        if (r.y + 1 < H && this.open(r.x, r.y + 1)) { r.state = 'wobble'; r.t = ROCKF.wobble; this.events.push({ type: 'rock-wobble', x: r.x, y: r.y, id: r.id }); }
      } else if (r.state === 'wobble') {
        r.t -= dt;
        if (r.t <= 0) {
          r.state = 'fall'; r.fy = r.y;
          this.cells[r.y * W + r.x] = DUG; this.dugVer++;
          this.rocksDropped++;
          this.events.push({ type: 'rock-fall', x: r.x, y: r.y, id: r.id });
          if (this.rocksDropped === 2 && !this.fruitDone) { this.fruit = { x: this.start[0], y: this.start[1], t: 10 }; this.fruitDone = true; this.events.push({ type: 'fruit', x: this.fruit.x, y: this.fruit.y }); }
        }
      } else if (r.state === 'fall') {
        r.fy += ROCKF.fall * dt;
        const below = Math.floor(r.fy + 1e-9) + 1;
        if (below >= H || !this.open(r.x, below)) {
          if (r.fy >= below - 1) {
            r.fy = below - 1; r.y = below - 1; r.state = 'land'; r.t = ROCKF.stay;
            const pts = CRUSH_PTS[Math.min(5, r.crushed)];
            this.score += pts;
            this.events.push({ type: 'rock-land', x: r.x, y: r.y, id: r.id, crushed: r.crushed, pts });
          }
        }
        // esmaga quem está embaixo
        for (const e of this.enemies) {
          if (!e.alive || e.hidden > 0 || Math.abs(e.x - r.x) > 0.55 || e.y < r.fy - 0.3 || e.y > r.fy + 0.85) continue;
          this.crush(e, r);
        }
        const a = this.ant;
        if (this.phase === 'play' && a.inv <= 0 && Math.abs(a.x - r.x) < 0.55 && a.y > r.fy - 0.3 && a.y < r.fy + 0.85) this.die('rock');
      } else if (r.state === 'land') {
        r.t -= dt;
        if (r.t <= 0) {
          this.rocks.splice(i, 1);
          this.events.push({ type: 'rock-break', x: r.x, y: r.y });
          // no chefe que só cai com pedra, sempre sobram pedras: uma nova aparece na terra
          if (this.boss === 'rhino' && this.rocks.filter(q => q.state === 'rest').length < 3) this.newRock();
        }
      }
    }
  }
  newRock() {
    const spots = [];
    for (let y = 2; y <= 8; y++) for (let x = 1; x < W - 1; x++) {
      if (this.cell(x, y) === DIRT && this.cell(x, y + 1) === DIRT && !this.rocks.some(r => r.x === x && Math.abs(r.y - y) < 2) && Math.hypot(this.ant.x - x, this.ant.y - y) > 2) spots.push([x, y]);
    }
    if (!spots.length) return;
    const [x, y] = spots[Math.floor(this.rng.next() * spots.length)];
    this.cells[y * W + x] = ROCK;
    this.rocks.push({ id: this.nextId++, x, y, fy: y, state: 'rest', t: 0, crushed: 0 });
    this.events.push({ type: 'rock-new', x, y });
  }
  crush(e, r) {
    r.crushed++;
    this.events.push({ type: 'crush', kind: e.kind, x: e.x, y: e.y });
    if (e.kind === 'rhino' || e.kind === 'queen' || e.kind === 'spider') {
      e.hp--;
      this.events.push({ type: 'boss-hit', kind: e.kind, x: e.x, y: e.y, hp: e.hp });
      if (e.hp <= 0) { e.alive = false; this.events.push({ type: 'boss-down', kind: e.kind, x: e.x, y: e.y }); return; }
      this.bossRespawn(e);
      return;
    }
    if (this.ant.hose === e.id) this.ant.hose = null;
    e.alive = false;
  }

  stepFlee(dt) {
    if (this.boss) return;
    const live = this.alive();
    if (live.length !== 1) { this.lastT = 0; return; }
    const e = live[0];
    this.lastT += dt;
    if (this.lastT > FLEE_AFTER && !e.flee) { e.flee = true; this.events.push({ type: 'flee', x: e.x, y: e.y }); }
    if (e.flee && e.x <= 0.05 && e.y <= 0.05) { e.alive = false; this.events.push({ type: 'escape', x: e.x, y: e.y }); }
  }

  collide() {
    if (this.phase !== 'play') return;
    const a = this.ant;
    if (this.fruit) {
      this.fruit.t -= this.dt;
      if (Math.hypot(a.x - this.fruit.x, a.y - this.fruit.y) < 0.6) {
        const pts = 1000 + 500 * this.L.world;
        this.score += pts;
        this.events.push({ type: 'fruit-get', x: this.fruit.x, y: this.fruit.y, pts });
        this.fruit = null;
      } else if (this.fruit.t <= 0) { this.events.push({ type: 'fruit-gone' }); this.fruit = null; }
    }
    if (a.inv > 0) return;
    const m = this.margin || 0;
    const cx = Math.round(a.x), cy = Math.round(a.y);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.fireOn > 0 && e.fireCells.some(([x, y]) => (x === cx && y === cy) || (m && Math.abs(x - a.x) < 0.5 + m && y === cy))) { this.die('fire'); return; }
      const hurts = e.kind === 'spider' ? e.alive && e.hidden <= 0 && e.inflate === 0 : this.harmful(e);
      if (hurts && Math.hypot(e.x - a.x, e.y - a.y) < ANT.hit + m) { this.die(e.kind); return; }
    }
  }

  die(why) {
    if (this.phase !== 'play') return;
    this.lives--; this.livesLost++;
    this.ant.alive = false;
    this.events.push({ type: 'die', why, x: this.ant.x, y: this.ant.y, lives: this.lives });
    if (this.lives <= 0) { this.finish(false); return; }
    this.phase = 'dying'; this.dieT = ANT.dieTime;
  }
  respawn() {
    this.phase = 'play';
    this.ant = this.makeAnt();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      Object.assign(e, { x: e.sx, y: e.sy, tx: e.sx, ty: e.sy, mode: e.kind === 'spider' ? 'ghost' : 'walk', inflate: 0, frozen: 0, fireWarn: 0, fireOn: 0, fireCells: [], flee: false, stuck: 0, weave: 0, hidden: 0, lx: undefined, ly: undefined });
      e.ghostAt = this.t + this.rng.range(this.L.ghost[0], this.L.ghost[1]);
      e.weaveAt = this.t + 3;
      e.fireT = this.t + this.rng.range(1.5, this.L.fire);
    }
    this.lastT = 0;
    this.events.push({ type: 'respawn' });
  }

  checkEnd() {
    if (this.phase !== 'play') return;
    if (this.enemies.every(e => !e.alive)) this.finish(true);
  }
  finish(won) {
    this.phase = won ? 'won' : 'lost';
    this.over = true;
    const eff = this.t + this.livesLost * DEATH_PENALTY;
    let bonus = 0;
    if (won) bonus = this.lives * 500 + Math.max(0, Math.round((this.L.par[1] - eff) * 20)) + (this.boss ? 3000 : 1000);
    this.score += bonus;
    this.result = { won, time: this.t, eff, stars: won ? starsFor(this.level, eff) : 0, score: this.score, bonus, lives: this.lives, livesLost: this.livesLost };
    this.events.push({ type: won ? 'won' : 'lost' });
  }

  // cópia para o robô imaginar o futuro (com outra semente)
  clone(seed, dt) {
    const g = Object.create(Game.prototype);
    Object.assign(g, this);
    g.rng = new Rng(seed);
    g.dt = dt || this.dt;
    g.events = [];
    g.cells = this.cells.slice();
    g.maps = {};
    g.ant = { ...this.ant };
    g.enemies = this.enemies.map(e => ({ ...e, fireCells: e.fireCells.slice() }));
    g.bossE = g.enemies.find(e => e.kind === this.boss) || null;
    g.rocks = this.rocks.map(r => ({ ...r }));
    g.fruit = this.fruit ? { ...this.fruit } : null;
    return g;
  }
}
