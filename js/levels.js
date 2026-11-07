// As 12 fases em 3 mundos. Sem navegador.
//
// O formigueiro é uma grade de 14 colunas x 12 linhas (linha 0 = superfície, ao ar livre; linhas
// 1 a 11 = terra). Cada fase é desenhada com um caractere por casa:
//   .  ar (superfície)        #  terra                  (espaço)  túnel já aberto
//   o  pedra (cai quando cavam embaixo)                 x  raiz / cristal (não se cava)
//   A  começo da formiga (túnel)
//   b  besouro (num túnel)    f  lagarta-de-fogo (num túnel)
//   K  besouro-rinoceronte (chefe 1)  Q  Lagartona (chefe 2)  S  Aranha de Cristal (chefe 3)
// speed: velocidade dos bichos (casas/s); ghost: [mín, máx] s entre uma virada de fantasma e outra;
// fire: s entre as brasas das lagartas.
// par: [3 estrelas, 2 estrelas] em segundos de "tempo efetivo" (tempo + 20 s por vida perdida),
// calibrados pelo robô (ver tests/run.js).

export const W = 14, H = 12;

export const WORLDS = [
  { name: 'Quintal', short: 'Quintal', theme: 0, hint: 'Aponte o dedo dentro da terra: a formiga vai atrás cavando. Gatilho: bomba de ar.' },
  { name: 'Raízes da Mangueira', short: 'Raízes', theme: 1, hint: 'Raízes não se cavam. Lagartas soltam brasa na horizontal: fique fora da linha delas.' },
  { name: 'Caverna de Cristal', short: 'Caverna', theme: 2, hint: 'Cristais não se cavam. Os bichos são mais rápidos: use as pedras!' },
];

export const LEVELS = [
  // ---------- Mundo 1: Quintal ----------
  {
    name: 'Primeiro buraco', world: 0, par: [16, 40], speed: 1.9, ghost: [10, 15], fire: 5,
    map: [
      '..............',
      '####### ######',
      '#####o# ######',
      '#  b ## ##o###',
      '####### ######',
      '#######A######',
      '##############',
      '#### ######b##',
      '########o## ##',
      '##b   ##### ##',
      '######o#######',
      '##############',
    ],
  },
  {
    name: 'Pedras soltas', world: 0, par: [30, 75], speed: 2.0, ghost: [9, 14], fire: 4.5,
    map: [
      '..............',
      '###o### ##o###',
      '####### ######',
      '##f   # ######',
      '####### ###o##',
      '##o####A######',
      '##############',
      '#b    ####o###',
      '######### ####',
      '###o##### b ##',
      '##############',
      '##b    #######',
    ],
  },
  {
    name: 'Formigueiro vizinho', world: 0, par: [45, 115], speed: 2.0, ghost: [9, 13], fire: 4.5,
    map: [
      '..............',
      '####### ######',
      '#f   ## ###o##',
      '####### ######',
      '###o### ## b##',
      '#######A######',
      '#b ######### #',
      '# #####o#### #',
      '# ##########f#',
      '##############',
      '####b   ###o##',
      '########b  ###',
    ],
  },
  {
    name: 'Besouro-rinoceronte', world: 0, boss: 'rhino', par: [75, 130], speed: 2.0, ghost: [10, 14], fire: 5,
    map: [
      '..............',
      '####### ######',
      '#o##o## #o##o#',
      '####### ######',
      '#b    # ######',
      '#######A######',
      '##o###o###o###',
      '##############',
      '####   K  ####',
      '##############',
      '#o##  b###o###',
      '##############',
    ],
  },
  // ---------- Mundo 2: Raízes da Mangueira ----------
  {
    name: 'Entre raízes', world: 1, par: [22, 45], speed: 2.1, ghost: [9, 13], fire: 4,
    map: [
      '..............',
      '####### ######',
      '##xxx## ##o###',
      '#b  ### ####x#',
      '####x## ####x#',
      '####x##A##f  #',
      '###o####xxx###',
      '##############',
      '#f   ##o## b##',
      '##xxx###x#####',
      '#####o####b ##',
      '##############',
    ],
  },
  {
    name: 'Lagartas no escuro', world: 1, par: [25, 60], speed: 2.1, ghost: [9, 13], fire: 3.6,
    map: [
      '..............',
      '####### ######',
      '#f   ## ######',
      '###x### ####o#',
      '###x### # f ##',
      '##o####A######',
      '########xxx###',
      '#b ####o######',
      '#########f  ##',
      '##xx##########',
      '####b   ###o##',
      '##############',
    ],
  },
  {
    name: 'Raiz profunda', world: 1, par: [55, 100], speed: 2.2, ghost: [8, 12], fire: 3.6,
    map: [
      '..............',
      '####### ######',
      '#b   ## ##x###',
      '##x#### ##x#o#',
      '##x#### ##x###',
      '##x####A##f  #',
      '####o#########',
      '#xxxx#####xxx#',
      '##f   ###  b##',
      '######o#######',
      '#b  ######  b#',
      '####xxxx######',
    ],
  },
  {
    name: 'Lagartona', world: 1, boss: 'queen', par: [32, 60], speed: 2.1, ghost: [9, 13], fire: 3.6,
    map: [
      '..............',
      '####### ######',
      '##o#### ####o#',
      '####### ######',
      '#f    # ######',
      '#######A######',
      '###x#####x####',
      '###########o##',
      '###   Q   ####',
      '###x######x###',
      '##o######o####',
      '##############',
    ],
  },
  // ---------- Mundo 3: Caverna de Cristal ----------
  {
    name: 'Cristais', world: 2, par: [65, 110], speed: 2.3, ghost: [8, 12], fire: 3.4,
    map: [
      '..............',
      '####### ######',
      '#x#b  # ##x###',
      '#x##### #####o',
      '###o### ###f #',
      '#######A######',
      '#xx########xx#',
      '#b  ##x###b ##',
      '##########o###',
      '##f   #xx#####',
      '####o########x',
      '#x####b  ###x#',
    ],
  },
  {
    name: 'Ecos', world: 2, par: [50, 105], speed: 2.3, ghost: [8, 12], fire: 3.2,
    map: [
      '..............',
      '####### ######',
      '##f   # ###x##',
      '####### ###x##',
      '#o##### ##b  #',
      '#######A######',
      '##x########o##',
      '##x#f   ######',
      '##############',
      '#b  ###xx#f  #',
      '#####o########',
      '###x###b  ####',
    ],
  },
  {
    name: 'Tudo ao mesmo tempo', world: 2, par: [55, 95], speed: 2.4, ghost: [7, 11], fire: 3.2,
    map: [
      '..............',
      '####### ######',
      '#b  ### ##f  #',
      '##o#### ######',
      '####x## ###o##',
      '##f   #A######',
      '########xx####',
      '#xx##b   ###o#',
      '##############',
      '#f   ####b  ##',
      '######o####x##',
      '##b   ########',
    ],
  },
  {
    name: 'Aranha de Cristal', world: 2, boss: 'spider', par: [42, 110], speed: 2.2, ghost: [8, 12], fire: 3.4,
    map: [
      '..............',
      '####### ######',
      '#x###o# ##o#x#',
      '####### ######',
      '#b   ## ######',
      '#######A######',
      '##x##o######x#',
      '##############',
      '###   S   ####',
      '##x########x##',
      '#o####b  ##o##',
      '##############',
    ],
  },
];

export const LEVELS_PER_WORLD = 4;

export function starsFor(level, effTime) {
  const p = LEVELS[level].par;
  return effTime <= p[0] ? 3 : effTime <= p[1] ? 2 : 1;
}
