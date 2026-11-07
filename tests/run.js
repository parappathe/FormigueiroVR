// Testes automáticos: node tests/run.js (ou npm test). Não tocam som nem usam navegador.
import { Rng } from '../js/vec.js';
import { Game, DT, ANT, PUMP, ROCKF, FIRE, GHOST, BOSS, LIVES, DEATH_PENALTY, FLEE_AFTER, DIRT, DUG, ROCK, ROOT, CELL, parseLevel } from '../js/sim.js';
import { LEVELS, WORLDS, LEVELS_PER_WORLD, starsFor, W, H } from '../js/levels.js';
import { makeRobot, HUMAN } from '../js/robot.js';

let fails = 0, count = 0;
function ok(cond, msg) {
  count++;
  if (!cond) { fails++; console.log('  FALHOU:', msg); }
}
const near = (a, b, e) => Math.abs(a - b) <= e;
const run = (g, sec, inp = {}) => { const evs = []; for (let i = 0; i < Math.round(sec / DT); i++) { g.step(typeof inp === 'function' ? inp(g) : inp); evs.push(...g.events); if (g.over) break; } return evs; };
// jogo vazio: sem bichos (para montar cenas)
function empty(level = 0, opts = {}) {
  const g = new Game(level, { seed: 3, ...opts });
  g.enemies = [];
  g.checkEnd = () => {};
  return g;
}
const bug = (g, kind, x, y, extra = {}) => { const e = g.makeEnemy(kind, x, y); Object.assign(e, extra); g.enemies.push(e); return e; };
const dig = (g, cells) => { for (const [x, y] of cells) { g.cells[y * W + x] = DUG; } g.dugVer++; };
const setAnt = (g, x, y, face = [1, 0]) => { Object.assign(g.ant, { x, y, face, dir: null, inv: 0 }); };

console.log('Fases');
{
  ok(LEVELS.length === 12 && WORLDS.length === 3, '12 fases em 3 mundos');
  ok(near(W * CELL, 0.49, 0.01) && near(H * CELL, 0.42, 0.01), 'terrário de ~50 x 40 cm');
  LEVELS.forEach((L, i) => {
    ok(L.world === Math.floor(i / LEVELS_PER_WORLD), `fase ${i + 1} no mundo certo`);
    ok(!!L.boss === (i % 4 === 3), `fase ${i + 1}: chefe só na 4ª de cada mundo`);
    ok(L.par[0] < L.par[1], `fase ${i + 1}: limites de estrelas em ordem`);
    ok(L.map.length === H && L.map.every(r => r.length === W), `fase ${i + 1}: grade de ${W} x ${H}`);
    ok(/^\.+$/.test(L.map[0]), `fase ${i + 1}: linha de cima é superfície`);
    ok(L.map.every(r => /^[.# oxAbfKQS]+$/.test(r)), `fase ${i + 1}: só caracteres da legenda`);
    const P = parseLevel(L);
    ok(L.map.join('').split('A').length === 2, `fase ${i + 1}: um começo da formiga`);
    ok(P.enemies.length >= 2, `fase ${i + 1}: tem bichos`);
    ok(P.rocks.every(r => P.cells[(r.y + 1) * W + r.x] !== DUG), `fase ${i + 1}: nenhuma pedra começa em cima de túnel`);
    if (L.boss) ok(P.enemies.filter(e => e.kind === L.boss).length === 1, `fase ${i + 1}: um chefe`);
  });
  ok(starsFor(0, 1) === 3 && starsFor(0, LEVELS[0].par[0] + 1) === 2 && starsFor(0, 9999) === 1, 'estrelas pelo tempo');
}

console.log('Formiga: seguir o dedo, cavar, virar na grade');
{
  const g = empty(0);
  setAnt(g, 7, 5);
  run(g, 1, { tx: 7, ty: 11 });
  ok(near(g.ant.y - 5, ANT.dig, 0.15) && g.ant.x === 7, 'cava terra a 2,3 casas/s seguindo o dedo para baixo');
  ok(g.cell(7, 6) === DUG && g.cell(7, 7) === DUG, 'deixa o túnel aberto por onde passa');
  const g2 = empty(0);
  setAnt(g2, 7, 5);
  run(g2, 0.5, { tx: 7, ty: 1 });
  ok(near(5 - g2.ant.y, ANT.speed * 0.5, 0.1), 'no túnel anda mais rápido (3,2 casas/s)');
  const g3 = empty(0);
  setAnt(g3, 7, 5);
  run(g3, 0.6, { tx: 12, ty: 5.2 });
  ok(g3.ant.y === 5 && g3.ant.x > 8, 'vai na direção do maior lado (horizontal)');
  // no meio da casa não vira de lado: vai até o centro
  const g4 = empty(0);
  setAnt(g4, 7, 5);
  run(g4, 0.15, { tx: 12, ty: 5 });
  const x4 = g4.ant.x;
  g4.step({ tx: g4.ant.x, ty: 11 });
  ok(g4.ant.y === 5 && g4.ant.x > x4, 'no meio da casa termina o caminho antes de virar');
  run(g4, 1, { tx: Math.round(x4) + 0.0, ty: 11 });
  ok(Number.isInteger(g4.ant.x) && g4.ant.y > 5, 'virou no centro da casa');
  // dedo perto da formiga: ela para
  const g5 = empty(0);
  setAnt(g5, 7, 5);
  run(g5, 0.5, { tx: 7.1, ty: 5.2 });
  ok(g5.ant.x === 7 && g5.ant.y === 5, 'dedo em cima da formiga: ela fica parada');
  // pedra e raiz bloqueiam
  const g6 = empty(4);
  const root = (() => { for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) if (g6.cell(x, y) === ROOT && g6.cell(x - 1, y) === DIRT) return [x, y]; })();
  dig(g6, [[root[0] - 1, root[1]]]);
  setAnt(g6, root[0] - 1, root[1]);
  run(g6, 1, { tx: root[0] + 3, ty: root[1] });
  ok(g6.ant.x === root[0] - 1, 'raiz não se cava');
  // teclado
  const g7 = empty(0);
  setAnt(g7, 7, 5);
  run(g7, 0.5, { dir: [0, -1] });
  ok(g7.ant.y < 4, 'setas do teclado movem a formiga');
}

console.log('Bomba de ar');
{
  const g = empty(0);
  dig(g, [[8, 5], [9, 5], [10, 5], [11, 5]]);
  setAnt(g, 7, 5, [1, 0]);
  const e = bug(g, 'beetle', 9, 5);
  e.speed = 0;
  g.step({ pump: true });
  ok(e.inflate === 1 && g.ant.hose === e.id, 'jato pega o bicho na direção em que ela olha');
  for (let k = 1; k < PUMP.pops; k++) { run(g, ANT.cool + 0.01); g.step({ pump: true }); }
  ok(!e.alive, `${PUMP.pops} bombadas estouram`);
  const g2 = empty(0);
  dig(g2, [[8, 5], [9, 5], [10, 5], [11, 5]]);
  setAnt(g2, 7, 5, [1, 0]);
  const e2 = bug(g2, 'beetle', 9, 5);
  g2.step({ pump: true }); run(g2, 0.2); g2.step({ pump: true });
  ok(e2.inflate === 2, 'infla');
  run(g2, PUMP.wait + PUMP.every * 2 + 0.1);
  ok(e2.inflate === 0, 'sem bombear ele desinfla');
  // terra no meio bloqueia o jato
  const g3 = empty(0);
  dig(g3, [[10, 5]]);
  setAnt(g3, 7, 5, [1, 0]);
  bug(g3, 'beetle', 10, 5, { speed: 0 });
  const ev = run(g3, 0.05, { pump: true });
  ok(ev.some(q => q.type === 'pump-miss'), 'o jato não atravessa terra');
  // olhando para o outro lado não pega
  const g4 = empty(0);
  dig(g4, [[8, 5], [9, 5]]);
  setAnt(g4, 7, 5, [-1, 0]);
  const e4 = bug(g4, 'beetle', 9, 5, { speed: 0 });
  g4.step({ pump: true });
  ok(e4.inflate === 0, 'só pega na direção em que ela olha');
  // fantasma não infla
  const g5 = empty(0);
  dig(g5, [[8, 5], [9, 5]]);
  setAnt(g5, 7, 5, [1, 0]);
  const e5 = bug(g5, 'beetle', 9, 5, { mode: 'ghost', ghostAge: 0, speed: 0 });
  g5.step({ pump: true });
  ok(e5.inflate === 0, 'fantasma não pega bomba');
  // inflado não machuca
  const g6 = empty(0);
  dig(g6, [[8, 5]]);
  setAnt(g6, 7, 5, [1, 0]);
  const e6 = bug(g6, 'beetle', 8, 5, { inflate: 2, lastPump: 0 });
  g6.t = 0; g6.collide();
  ok(g6.phase === 'play', 'bicho inflado não machuca');
  void e6;
}

console.log('Besouros e lagartas');
{
  const g = empty(0);
  dig(g, [[8, 5], [9, 5], [10, 5], [11, 5], [11, 6], [11, 7]]);
  setAnt(g, 7, 5);
  const e = bug(g, 'beetle', 11, 7);
  e.ghostAt = 1e9;
  run(g, 2, (gg) => { gg.ant.inv = 9; return {}; });
  ok(Math.hypot(e.x - 7, e.y - 5) < 2.5, 'besouro anda pelos túneis atrás da formiga');
  const g2 = empty(0);
  setAnt(g2, 7, 1);
  dig(g2, [[2, 9]]);
  const e2 = bug(g2, 'beetle', 2, 9);
  e2.ghostAt = g2.t + 0.5;
  const ev2 = run(g2, 4, (gg) => { gg.ant.inv = 9; return {}; });
  ok(ev2.some(q => q.type === 'ghost'), 'vira fantasma');
  ok(Math.hypot(e2.x - 7, e2.y - 1) < Math.hypot(2 - 7, 9 - 1) - 3, 'fantasma atravessa a terra em direção à formiga');
  ok(near(GHOST.speed, 1.3, 1e-9), 'fantasma é mais lento');
  // lagarta: aviso, brasa na horizontal, bloqueada pela terra
  const g3 = empty(1);
  dig(g3, [[3, 9], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9]]);
  setAnt(g3, 6, 9);
  const f = bug(g3, 'fire', 3, 9, { fireT: 0, ghostAt: 1e9, speed: 0 });
  const ev3 = run(g3, FIRE.warn + 0.1);
  ok(ev3.some(q => q.type === 'fire-warn') && ev3.some(q => q.type === 'fire'), 'lagarta avisa e solta brasa');
  ok(f.fireCells.length === FIRE.len && f.fireCells.every(([, y]) => y === 9), 'brasa na horizontal, 3 casas');
  ok(ev3.some(q => q.type === 'die' && q.why === 'fire'), 'brasa queima a formiga');
  const g4 = empty(1);
  dig(g4, [[3, 9], [4, 9]]);
  setAnt(g4, 6, 9);
  const f4 = bug(g4, 'fire', 3, 9, { fireT: 0, ghostAt: 1e9, speed: 0 });
  run(g4, FIRE.warn + 0.1);
  ok(f4.fireCells.length === 1 && g4.phase === 'play', 'a brasa não atravessa terra');
  // encostar mata
  const g5 = empty(0);
  dig(g5, [[8, 5]]);
  setAnt(g5, 7, 5);
  bug(g5, 'beetle', 8, 5);
  const ev5 = run(g5, 0.5);
  ok(ev5.some(q => q.type === 'die'), 'encostar num bicho mata');
}

console.log('Pedras');
{
  const g = empty(0);
  const r = g.rocks.find(q => q.x === 6 && q.y === 10);
  dig(g, [[6, 11]]);
  const ev = run(g, 0.1);
  ok(ev.some(q => q.type === 'rock-wobble'), 'cavou embaixo: a pedra balança');
  run(g, ROCKF.wobble + 0.4);
  ok(r.state === 'land' || r.state === 'fall' || !g.rocks.includes(r), 'depois de balançar, cai');
  // esmaga 2 bichos de uma vez
  const g2 = empty(0);
  const r2 = g2.rocks.find(q => q.x === 5 && q.y === 2);
  dig(g2, [[5, 3], [5, 4], [5, 5], [5, 6]]);
  bug(g2, 'beetle', 5, 5, { speed: 0, ghostAt: 1e9 }); bug(g2, 'beetle', 5, 6, { speed: 0, ghostAt: 1e9 });
  setAnt(g2, 7, 1);
  const s0 = g2.score;
  const ev2 = run(g2, ROCKF.wobble + 2);
  ok(g2.enemies.every(e => !e.alive) && ev2.filter(q => q.type === 'crush').length === 2, 'pedra esmaga os bichos embaixo');
  ok(g2.score - s0 >= 2500, 'esmagar 2 de uma vez vale mais');
  void r2;
  const g3 = empty(0);
  dig(g3, [[5, 3], [5, 4]]);
  setAnt(g3, 5, 4);
  const ev3 = run(g3, ROCKF.wobble + 1, (gg) => ({ tx: 5, ty: 4 }));
  ok(ev3.some(q => q.type === 'die' && q.why === 'rock'), 'pedra esmaga a formiga também');
  // duas pedras: frutinha
  const g4 = empty(0);
  dig(g4, [[5, 3], [6, 11]]);
  setAnt(g4, 0, 0);
  const ev4 = run(g4, ROCKF.wobble + 0.3);
  ok(ev4.some(q => q.type === 'fruit') && !!g4.fruit, 'depois de 2 pedras aparece a frutinha');
  setAnt(g4, g4.fruit.x, g4.fruit.y); const ev5 = run(g4, 0.05);
  ok(ev5.some(q => q.type === 'fruit-get'), 'pega a frutinha');
}

console.log('O último foge');
{
  const g = new Game(0, { seed: 2 });
  g.enemies.slice(1).forEach(e => { e.alive = false; });
  const e = g.enemies[0];
  const ev = run(g, FLEE_AFTER + 0.2, (gg) => { gg.ant.inv = 9; return {}; });
  ok(ev.some(q => q.type === 'flee') && e.flee, 'o último bicho foge para a superfície');
  const ev2 = run(g, 40, (gg) => { gg.ant.inv = 9; return {}; });
  ok(ev2.some(q => q.type === 'escape') && g.phase === 'won', 'escapou: a fase acaba (sem os pontos dele)');
}

console.log('Chefes');
{
  // rinoceronte: bomba só segura, pedra derruba
  const g = new Game(3, { seed: 1 });
  const K = g.bossE;
  g.enemies.filter(e => e !== K).forEach(e => { e.alive = false; });
  dig(g, [[8, 8], [9, 8]]);
  setAnt(g, 9, 8, [-1, 0]);
  K.x = K.tx = 7; K.y = K.ty = 8; K.ghostAt = 1e9;
  g.step({ pump: true });
  ok(K.inflate === 0 && K.frozen > 0, 'rinoceronte não infla: a bomba só segura ele');
  K.frozen = 0;
  for (let i = 0; i < 40; i++) { g.step({ pump: true }); run(g, 0.18, (gg) => { gg.ant.inv = 9; return {}; }); }
  ok(K.angry > 0 || g.events.some(q => q.type === 'rhino-angry') || K.frozen === 0, 'segurar demais deixa ele bravo (a bomba para de segurar)');
  const r = g.rocks.find(q => q.state === 'rest');
  K.x = K.tx = r.x; K.y = K.ty = r.y + 2; K.frozen = 5; K.angry = 0; K.hidden = 0;
  dig(g, [[r.x, r.y + 1], [r.x, r.y + 2]]);
  const ev = run(g, ROCKF.wobble + 1, (gg) => { gg.ant.inv = 9; return {}; });
  ok(ev.some(q => q.type === 'boss-hit') && K.hp === BOSS.rhino.hp - 1, 'pedra na cabeça tira vida do rinoceronte');
  // Lagartona: 6 bombadas, deixa ovo
  const gq = new Game(7, { seed: 1 });
  const Q = gq.bossE;
  gq.enemies.filter(e => e !== Q).forEach(e => { e.alive = false; });
  setAnt(gq, Q.x - 2, Q.y, [1, 0]);
  Q.speed = 0; Q.fireT = 1e9;
  const n0 = gq.enemies.length;
  for (let k = 0; k < BOSS.queen.pumps; k++) { gq.step({ pump: true }); run(gq, ANT.cool + 0.01, (gg) => { gg.ant.inv = 9; return {}; }); }
  ok(Q.hp === BOSS.queen.hp - 1 && gq.enemies.length === n0 + 1, 'Lagartona estoura com 6 bombadas e deixa um ovo de lagarta');
  ok(Q.hidden > 0, 'e some para voltar em outro lugar');
  // Aranha: só pega quando está tecendo
  const gs = new Game(11, { seed: 1 });
  const S = gs.bossE;
  gs.enemies.filter(e => e !== S).forEach(e => { e.alive = false; });
  setAnt(gs, S.x - 2, S.y, [1, 0]);
  S.weaveAt = 1e9;
  gs.step({ pump: true });
  ok(S.inflate === 0, 'aranha andando (pela terra) não pega bomba');
  S.weave = 2; S.x = Math.round(S.x); S.y = Math.round(S.y);
  setAnt(gs, S.x - 2, S.y, [1, 0]);
  dig(gs, [[S.x - 2, S.y], [S.x - 1, S.y], [S.x, S.y]]);
  gs.ant.cool = 0;
  for (let k = 0; k < BOSS.spider.pumps; k++) { gs.step({ pump: true }); run(gs, ANT.cool + 0.01, (gg) => { gg.ant.inv = 9; return {}; }); }
  ok(S.hp === BOSS.spider.hp - 1, 'tecendo a teia ela pega: 5 bombadas tiram uma vida');
  S.hp = 1; S.hidden = 0; S.weave = 2; S.x = Math.round(gs.ant.x + 2); S.y = Math.round(gs.ant.y); S.inflate = 0;
  dig(gs, [[S.x - 1, S.y], [S.x, S.y]]);
  for (let k = 0; k < BOSS.spider.pumps; k++) { gs.step({ pump: true }); run(gs, ANT.cool + 0.01, (gg) => { gg.ant.inv = 9; return {}; }); }
  gs.checkEnd();
  ok(!S.alive && gs.phase === 'won', 'aranha derrotada: venceu');
}

console.log('Vidas, tempo efetivo, cópia');
{
  const g = new Game(0, { seed: 1 });
  g.die('beetle');
  ok(g.lives === LIVES - 1 && g.phase === 'dying', 'perde uma vida');
  for (let i = 0; i < 1000 && g.phase === 'dying'; i++) g.step({});
  ok(g.phase === 'play' && g.ant.x === g.start[0] && g.ant.y === g.start[1] && g.ant.inv > 0, 'volta ao começo, piscando');
  ok(g.enemies.every(e => e.x === e.sx && e.y === e.sy), 'os bichos voltam para o lugar deles');
  g.ant.inv = 0; g.die('beetle'); run(g, ANT.dieTime + 0.1); g.ant.inv = 0; g.die('beetle');
  ok(g.over && !g.result.won, 'sem vidas: perde a fase');
  const g2 = empty(0);
  g2.livesLost = 1; g2.t = 10; g2.checkEnd = Game.prototype.checkEnd; g2.checkEnd();
  ok(near(g2.result.eff, 10 + DEATH_PENALTY, 1e-6), 'tempo efetivo soma a multa por vida perdida');
  const g3 = new Game(2, { seed: 9 });
  run(g3, 3);
  const c = g3.clone(77, 1 / 20);
  const ax = g3.ant.x, dug = g3.cells.slice();
  for (let i = 0; i < 40; i++) c.step({ dir: [1, 0], pump: true });
  ok(g3.ant.x === ax && g3.cells.every((v, i) => v === dug[i]) && c.t > g3.t, 'a cópia do robô não mexe no jogo de verdade');
}

console.log('Robô (limites humanos) nas 12 fases');
{
  ok(HUMAN.decide >= 0.3 && HUMAN.pumpGap >= 0.15 && HUMAN.handSpeed * CELL <= 0.8, 'limites humanos do robô');
  const SEEDS = [1, 2, 3, 4, 5];
  let total = 0;
  for (let lv = 0; lv < LEVELS.length; lv++) {
    const rs = [];
    for (const seed of SEEDS) {
      const g = new Game(lv, { seed });
      const robot = makeRobot({ seed: seed * 7 });
      let lastPump = -9, minGap = 9, lastHand = null, maxHand = 0;
      while (!g.over && g.t < 400) {
        const inp = robot.step(g);
        if (inp.pump) { minGap = Math.min(minGap, g.t - lastPump); lastPump = g.t; }
        if (lastHand) maxHand = Math.max(maxHand, Math.hypot(inp.tx - lastHand[0], inp.ty - lastHand[1]) / DT);
        lastHand = [inp.tx, inp.ty];
        g.step(inp);
      }
      ok(minGap >= HUMAN.pumpGap - 1e-6, `fase ${lv + 1}: o robô não bombeia mais rápido que uma pessoa`);
      ok(maxHand <= HUMAN.handSpeed + 1e-6, `fase ${lv + 1}: o dedo do robô não passa de 0,6 m/s`);
      rs.push(g.result || { won: false, eff: 999, stars: 0, livesLost: 9 });
    }
    const allWon = rs.every(r => r.won), minStars = Math.min(...rs.map(r => r.stars));
    ok(allWon, `fase ${lv + 1}: o robô vence com as ${SEEDS.length} sementes`);
    ok(minStars >= 2, `fase ${lv + 1}: o robô faz pelo menos 2 estrelas (${rs.map(r => r.stars).join(' ')})`);
    total += rs.reduce((s, r) => s + r.stars, 0);
    console.log(`  ${String(lv + 1).padStart(2)} ${LEVELS[lv].name.padEnd(22)} tempo efetivo ${rs.map(r => Math.round(r.eff)).join(' ').padEnd(22)} vidas perdidas ${rs.map(r => r.livesLost).join('')}  estrelas ${rs.map(r => r.stars).join('')}  (limites ${LEVELS[lv].par.join('/')})`);
  }
  console.log(`  média de estrelas do robô: ${(total / (SEEDS.length * LEVELS.length)).toFixed(2)}`);
}

console.log(fails ? `\n${fails} de ${count} testes falharam` : `\nTudo certo (${count} testes)`);
process.exit(fails ? 1 : 0);
void Rng; void ROCK;
