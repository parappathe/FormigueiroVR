// Robô jogador com limites humanos: decide a cada 0,3 s (reação) e fica preso à decisão até a
// próxima; a ponta do dedo anda no máximo 0,6 m/s e erra o ponto em até 1/4 de casa; aperta a bomba
// no máximo 5 vezes por segundo. Para decidir, ele imagina o próximo 1,2 s (cópia do jogo com OUTRA
// semente: não sabe quando os bichos viram fantasma nem quando as lagartas cospem brasa) para várias
// jogadas e escolhe a que não morre e mais estoura bichos ou chega perto do alvo pelo caminho
// (mapa de custo: túnel aberto é rápido, terra é mais lenta, pedra e raiz não passam).
// Usado pelos testes (calibra as estrelas) e pelo dev.autoplay. Sem navegador.
import { Rng, clamp } from './vec.js';
import { ANT, CELL, DUG, DIRT, BOSS } from './sim.js';
import { W, H } from './levels.js';

export const HUMAN = {
  decide: 0.3,
  handSpeed: 0.6 / CELL,      // casas/s da ponta do dedo
  aim: 0.25,                  // casas de erro
  pumpGap: 0.18,              // s entre apertos
  look: 1.2, lookDt: 1 / 20, margin: 0.12,
};
const DIRS = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };

export function makeRobot(opts = {}) { return new Robot(opts); }

class Robot {
  constructor(opts) {
    this.h = { ...HUMAN, ...opts };
    this.rng = new Rng(opts.seed ?? 11);
    this.reset();
  }
  reset() { this.plan = null; this.until = -1; this.hand = null; this.nextPump = 0; this.field = null; this.target = null; }

  // custo (s) de cada casa até o alvo (Dijkstra simples; a grade é pequena)
  costField(game, tx, ty) {
    const n = W * H, d = new Float32Array(n).fill(Infinity), done = new Uint8Array(n);
    if (tx < 0) return d;
    d[ty * W + tx] = 0;
    for (;;) {
      let bi = -1, bv = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && d[i] < bv) { bv = d[i]; bi = i; }
      if (bi < 0) break;
      done[bi] = 1;
      const x = bi % W, y = (bi - x) / W;
      // entrar na casa (x, y) vindo do vizinho custa conforme ESTA casa (a formiga vai até aqui)
      const here = game.cell(x, y) === DUG ? 1 / ANT.speed : 1 / ANT.dig;
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy, c = game.cell(nx, ny);
        if (c !== DUG && c !== DIRT) continue;
        const j = ny * W + nx, v = bv + here;
        if (v < d[j]) d[j] = v;
      }
    }
    return d;
  }
  pickTarget(game) {
    const a = game.ant, from = this.costField(game, Math.round(a.x), Math.round(a.y));
    let best = null, bc = Infinity;
    for (const e of game.enemies) {
      if (!e.alive || e.hidden > 0) continue;
      let c;
      if (e.kind === 'rhino') {
        // o rinoceronte só cai com pedra: vai para baixo de uma pedra que ele alcança
        for (const r of game.rocks) {
          if (r.state !== 'rest' || game.cell(r.x, r.y + 1) !== DIRT) continue;
          const v = from[(r.y + 1) * W + r.x] + Math.hypot(e.x - r.x, e.y - r.y - 1) * 0.15;
          if (v < bc) { bc = v; best = { x: r.x, y: r.y + 1, e }; }
        }
        if (best) continue;
      }
      const cx = clamp(Math.round(e.x), 0, W - 1), cy = clamp(Math.round(e.y), 0, H - 1);
      c = from[cy * W + cx];
      if (!Number.isFinite(c)) c = 50;
      if (e.mode === 'ghost' && e.kind !== 'spider') c += 4;
      if (c < bc) { bc = c; best = { x: cx, y: cy, e }; }
    }
    return best;
  }

  // o que vale a pena (quanto menor melhor)
  value(g, field) {
    let f = 0;
    for (const e of g.enemies) {
      if (!e.alive) { f -= 3000; continue; }
      f -= e.inflate * 250 + (e.frozen > 0 ? 60 : 0);
      f -= (BOSS[e.kind] ? (BOSS[e.kind].hp - e.hp) * 4000 : 0);
    }
    const a = g.ant, i = clamp(Math.round(a.y), 0, H - 1) * W + clamp(Math.round(a.x), 0, W - 1);
    const c = field ? field[i] : 0;
    f += (Number.isFinite(c) ? c : 30) * 40;
    // armadilha de pedra para o rinoceronte: pedra soltando em cima da coluna dele
    const rh = g.enemies.find(e => e.kind === 'rhino' && e.alive && e.hidden <= 0);
    if (rh) for (const r of g.rocks) {
      if (Math.abs(rh.x - r.x) > 0.5 || rh.y <= r.fy) continue;
      let clear = true;
      for (let y = Math.floor(r.fy) + 1; y < Math.round(rh.y); y++) if (g.cell(r.x, y) !== DUG) { clear = false; break; }
      if (!clear) continue;
      if (r.state === 'wobble' || r.state === 'fall') f -= 900;
      else if (rh.frozen > 0) f -= 150;
    }
    // mira pronta vale alguma coisa
    if (g.scan()) f -= 120;
    // não ficar colado nos bichos soltos
    for (const e of g.enemies) {
      if (!g.harmful(e) && !(e.kind === 'spider' && e.alive && e.inflate === 0)) continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < 1.6) f += (1.6 - d) * 150;
    }
    // embaixo de pedra balançando é perigoso
    for (const r of g.rocks) if ((r.state === 'wobble' || r.state === 'fall') && Math.abs(a.x - r.x) < 0.7 && a.y > r.fy) f += 300;
    return f;
  }
  towardDir(g, field) {
    if (!field) return null;
    const a = g.ant, cx = Math.round(a.x), cy = Math.round(a.y);
    let best = null, bv = field[cy * W + cx];
    for (const d of Object.values(DIRS)) {
      const x = cx + d[0], y = cy + d[1];
      if (!g.antCan(x, y)) continue;
      const v = field[y * W + x];
      if (v < bv - 1e-6) { bv = v; best = d; }
    }
    return best;
  }

  simulate(game, A, B, field, seed) {
    const g = game.clone(seed, this.h.lookDt);
    g.margin = this.h.margin;
    const lives = g.lives;
    const n = Math.round(this.h.look / this.h.lookDt), nA = Math.round(this.h.decide / this.h.lookDt);
    const every = Math.max(1, Math.round(this.h.pumpGap / this.h.lookDt));
    for (let k = 0; k < n; k++) {
      const p = k < nA ? A : B;
      let dir = p.dir;
      if (p.mode === 'toward') dir = this.towardDir(g, field);
      else if (p.mode === 'back') { const t = this.towardDir(g, field); dir = t ? [-t[0], -t[1]] : null; }
      const kk = k < nA ? k : k - nA;
      // aperta a bomba quando a mira pega (como uma pessoa faria)
      const aim = p.pump && kk % every === 0 && (g.ant.hose || g.scan());
      g.step({ dir, pump: !!aim });
      if (g.lives < lives || g.phase === 'dying') return 1e6 - k * 1000;
      if (g.over) return g.phase === 'won' ? -1e7 + k : 1e6;
    }
    return this.value(g, field);
  }

  decide(game) {
    this.target = this.pickTarget(game);
    const field = this.target ? this.costField(game, this.target.x, this.target.y) : null;
    this.field = field;
    const As = [{ mode: 'stay' }, { mode: 'toward' }];
    for (const [k, d] of Object.entries(DIRS)) As.push({ mode: k, dir: d });
    for (const a of As.slice()) As.push({ ...a, pump: true });
    // com um bicho na mira, quem joga continua bombeando (não deixa desinflar)
    const inSight = game.ant.hose ? game.enemies.find(e => e.id === game.ant.hose) : game.scan();
    if (inSight && inSight.kind !== 'rhino') for (let i = As.length - 1; i >= 0; i--) if (!As[i].pump) As.splice(i, 1);
    const Bs = [{ mode: 'toward' }, { mode: 'stay' }, { mode: 'toward', pump: true }, { mode: 'stay', pump: true }, { mode: 'back' }];
    const seed = Math.floor(this.rng.next() * 1e9);
    let best = As[0], bf = Infinity;
    for (const A of As) {
      let fa = Infinity;
      for (const B of Bs) { const f = this.simulate(game, A, B, field, seed); if (f < fa) fa = f; }
      fa += (A.mode === 'toward' ? 0 : 1) + (A.pump ? 2 : 0);
      if (fa < bf) { bf = fa; best = A; }
    }
    return best;
  }

  step(game) {
    const a = game.ant;
    if (game.t >= this.until || !this.plan) {
      this.plan = this.decide(game);
      this.until = game.t + this.h.decide;
      this.jit = [this.rng.range(-this.h.aim, this.h.aim), this.rng.range(-this.h.aim, this.h.aim)];
    }
    const p = this.plan;
    let dir = p.dir;
    if (p.mode === 'toward') dir = this.field ? this.towardDir(game, this.field) : null;
    // onde o dedo quer ir: um pouco à frente da formiga na direção escolhida (ou em cima dela)
    const want = dir ? [a.x + dir[0] * 0.8 + this.jit[0] * 0.3, a.y + dir[1] * 0.8 + this.jit[1] * 0.3] : [a.x + this.jit[0] * 0.5, a.y + this.jit[1] * 0.5];
    if (!this.hand) this.hand = [a.x, a.y];
    const dx = want[0] - this.hand[0], dy = want[1] - this.hand[1], d = Math.hypot(dx, dy), mv = this.h.handSpeed * game.dt;
    if (d <= mv) this.hand = want; else { this.hand = [this.hand[0] + dx / d * mv, this.hand[1] + dy / d * mv]; }
    let pump = false;
    if (p.pump && game.t >= this.nextPump && (a.hose || game.scan())) { pump = true; this.nextPump = game.t + this.h.pumpGap; }
    return { tx: this.hand[0], ty: this.hand[1], pump };
  }
}
