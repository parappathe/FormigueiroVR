# FormigueiroVR

Formigueiro: jogo de cavar em VR para o Meta Quest 3 no navegador (WebXR), sem instalar nada. Na
frente do jogador, num banquinho, fica um **formigueiro de vidro** (terrário fino de 49 x 42 cm com a
terra em camadas de cores). O jogador **encosta a ponta do controle (ou o dedo) no vidro** e a
**formiguinha Tatá** vai até lá cavando túnel, numa grade e com velocidade limitada (não teletransporta).
Com o **gatilho** ela solta um jato da **bomba de ar** que carrega nas costas: bombear de novo infla o
bicho até estourar; parar faz ele desinflar. Besouros andam pelos túneis e de vez em quando viram
**fantasma** e atravessam a terra; **lagartas-de-fogo** soltam brasa na horizontal. Cavar embaixo de
uma **pedra** faz ela cair e esmagar quem estiver embaixo. O grip na moldura pega o formigueiro para
ver de perto. 12 fases em 3 mundos (Quintal, Raízes da Mangueira, Caverna de Cristal), a 4ª de cada
mundo é um chefe. Estrelas pelo tempo, modo Fliperama (as 12 seguidas) com recorde de 3 letras.
Também joga no PC com mouse e teclado. Tudo em português. Jogo original dentro do gênero (nomes,
bichos, chefes e visual próprios).

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos o endereço publicado (quando for publicado:
**https://parappathe.github.io/FormigueiroVR/**) e apertar "Entrar em VR". Para atualizar o site:
commitar e rodar `python publicar.py FormigueiroVR` na pasta `C:\claude code` (só quando o Eduardo pedir).

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8876` (o painel de
visualização usa `.claude/launch.json`). O `serve.py` manda o navegador não guardar cache;
`python serve.py --https` serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Guiar a formiga | Encostar a ponta do controle (bolinha amarela 5 cm à frente) no vidro, até 7 cm dele; com rastreamento de mãos, a ponta do indicador | Mouse sobre o formigueiro, ou setas/WASD |
| Bomba de ar | Gatilho ou A/X (com mãos: pinça) | Clique ou espaço |
| Pegar o formigueiro | Grip com a mão na moldura (ela acende); soltar deixa onde está, perto do banquinho ele volta sozinho | (fica no banquinho) |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| FPS | Menu → FPS | Tecla F |

A mão que segura o formigueiro não guia a formiga; a outra guia. Na pausa: "Recentralizar" (VR) e
"Pôr no banquinho". O controle vibra a cada bombada, ao estourar bicho, ao morrer, nas pedras que
esmagam e nas pancadas dos chefes.

### Regras

- **Grade:** 14 colunas x 12 linhas de 3,5 cm; linha 0 é a superfície (ar livre). A formiga anda 3,2
  casas/s no túnel e cava a 2,3 casas/s; só vira no centro de uma casa (no meio, termina o caminho
  ou volta). Pedra, raiz e cristal não se cavam.
- **Bomba de ar:** alcança 3 casas na direção em que a formiga olha, só por túnel aberto (terra
  bloqueia). Cada aperto infla 1; 4 estoura (pontos pela profundidade: 200 a 500, lagarta vale 1,5x).
  Sem bombear por 0,7 s, desinfla 1 a cada 0,55 s. Bicho inflado não machuca e não anda. Fantasma não
  pega bomba. No máximo um aperto a cada 0,15 s.
- **Besouros** perseguem pelos túneis; de tempos em tempos (ou quando não acham caminho) viram
  fantasma e atravessam a terra mais devagar (1,3 casa/s). **Lagartas-de-fogo** param, acendem a boca
  (0,75 s de aviso) e soltam brasa de 3 casas na horizontal (a brasa não atravessa terra).
- **Pedras:** cavou embaixo, ela balança 0,9 s e cai até achar terra; esmaga bichos (1 = 1000,
  2 = 2500, 3 = 4000...) e a formiga também. Depois de 2 pedras, aparece uma **frutinha** no começo do
  túnel por 10 s.
- **O último bicho foge:** sozinho por 2 s, ele corre para o canto de cima à esquerda; se escapar, a
  fase acaba (sem os pontos dele).
- **Chefes:** Fase 4, **Besouro-rinoceronte**: não infla; a bomba só segura ele parado 1,6 s, e
  segurar demais (4 s) deixa ele bravo por 4 s (a bomba não segura). Só cai com **pedra na cabeça**
  (2 vezes); sempre aparecem pedras novas. Fase 8, **Lagartona**: estoura com 6 bombadas e precisa
  estourar 4 vezes (volta mais rápida a cada vez e deixa um ovo que vira lagarta); brasa de 4 casas. Fase 12,
  **Aranha de Cristal**: atravessa a terra atrás da formiga e machuca sempre; de 5 em 5 s para num
  túnel para tecer a teia por 2,5 s, e só então pega bomba (5 bombadas); 3 vidas.
- **Vidas:** 3 por fase. Perdeu: a formiga volta ao começo e os bichos vivos aos lugares deles; os
  túneis ficam.
- **Estrelas** pelo "tempo efetivo" (tempo + 20 s por vida perdida); limites em `par` de cada fase.
  Vencer libera a próxima.
- **Fliperama:** as 12 fases seguidas com as vidas que sobraram (+1 vida a cada chefe), pontos
  somados (cada casa cavada vale 10); no fim, se entrar nos 8 melhores, escolhe 3 letras (no PC dá
  para digitar).
- Progresso, recordes e opções no navegador (localStorage `formigueirovr.v1`).

Fases (em `js/levels.js`): Quintal: 1 Primeiro buraco, 2 Pedras soltas, 3 Formigueiro vizinho,
4 Besouro-rinoceronte. Raízes da Mangueira: 5 Entre raízes, 6 Lagartas no escuro, 7 Raiz profunda,
8 Lagartona. Caverna de Cristal: 9 Cristais, 10 Ecos, 11 Tudo ao mesmo tempo, 12 Aranha de Cristal.

## Como testar

- `node tests/run.js` (ou `npm test`, ~12 s): fases (grade 14 x 12, legenda, um começo, pedras sem
  túnel embaixo, um chefe), formiga (cava a 2,3, túnel a 3,2, eixo maior, vira só no centro, para com
  o dedo em cima, raiz bloqueia, teclado), bomba (pega na direção, 4 estouram, desinfla, terra
  bloqueia, de costas não pega, fantasma não pega, inflado não machuca), besouros (perseguem, viram
  fantasma, atravessam terra), lagartas (aviso, brasa de 3 na horizontal, queima, terra bloqueia),
  encostar mata, pedras (balança, cai, esmaga 2, esmaga a formiga, frutinha), o último foge e
  escapa, chefes (rinoceronte só segura/fica bravo/cai com pedra; Lagartona 6 bombadas e ovo; aranha
  só quando tece; derrotar vence), vidas e respawn, tempo efetivo, cópia do robô sem mexer no jogo,
  e o **robô**: joga as 12 fases com 5 sementes cada, com limites humanos (decide a cada 0,3 s e fica
  preso à decisão, ponta do dedo a no máximo 0,6 m/s com erro de até 1/4 de casa, no máximo um aperto
  da bomba a cada 0,18 s, não sabe quando os bichos viram fantasma nem quando a lagarta cospe) e tem
  que vencer todas com pelo menos 2 estrelas. Imprime o tempo efetivo por fase. Termina com "Tudo
  certo". Não toca som.
- No navegador (console): `dev.loadLevel(8)` abre a fase 8 (1 a 12, ignora o bloqueio),
  `dev.autoplay = true` faz o robô jogar, `dev.advance(20)` avança 20 s na hora, `dev.state()`
  mostra tela, fase, vidas, pontos, formiga, bichos, pedras e chefe, `dev.arcade()` começa o
  fliperama, `dev.snapshot()` devolve a imagem da tela (JPEG em data URL), `dev.resetSave()` apaga
  progresso e recordes. `window.formigueiro` tem `game`, `save`, `sfx`, `robot`, `startLevel`,
  `startArcade`, `goMenu`.
- **Só dá para testar no óculos:** se guiar a formiga com a ponta do controle encostada no vidro é
  natural (distância de 7 cm, bolinha amarela), pegar e trazer o formigueiro para perto do rosto,
  soltar e voltar ao banquinho, a ponta do indicador e a pinça com rastreamento de mãos, recentralizar,
  vibração, conforto e FPS no Quest.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", HUD do PC (fase, tempo, vidas, bichos que faltam, avisos) |
| `js/vec.js` | Vetores e aleatório com semente (cópia do TijoloVR). Sem navegador |
| `js/sim.js` | Regras: `parseLevel`, `Game` (grade, formiga seguindo o alvo, bomba e mangueira, inflar/desinflar/estourar, besouros com caminho pelos túneis e modo fantasma, lagartas e brasa, pedras, frutinha, fuga do último, chefes, vidas, pontos, estrelas, `clone` para o robô). Medidas (`CELL`, `TANK`). Sem navegador |
| `js/levels.js` | Os 3 mundos e as 12 fases desenhadas em texto (legenda no topo) e os limites de estrelas. Sem navegador |
| `js/robot.js` | Robô com limites humanos: escolhe o alvo pelo caminho mais barato (túnel rápido, terra lenta), imagina 1,2 s de várias jogadas numa cópia do jogo e escolhe a que não morre e mais estoura; contra o rinoceronte, mira em pedras. Testes e `dev.autoplay`. Sem navegador |
| `js/main.js` | Liga tudo: render, VR (ponta do controle/dedo guiando, gatilho/A/pinça na bomba, grip pegando o terrário, vibração, recentralizar), mouse e teclado, menus (fases, fliperama, recordes, letras), letreiro, eventos → sons e efeitos, `dev` |
| `js/scene.js` | Cenários dos 3 mundos (panorama desenhado em canvas, chão, enfeites), banquinho, terrário (terra pintada num canvas que muda quando cava, moldura, vidro, grama), formiga, besouros, lagartas, rinoceronte, Lagartona, aranha, pedras, frutinha, brasa, teia, mangueira, letreiro com lâmpadas, partículas |
| `js/ui.js` | Painel de menu 3D em canvas, quadradinhos de fase e placas de texto |
| `js/audio.js` | Sons sintetizados com áudio 3D (HRTF), musiquinha por mundo e música de corrida quando o último foge |
| `js/save.js` | Progresso, recordes (8 melhores) e opções |
| `tests/run.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8876, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: na grade, x = coluna (0 a 13, da esquerda para a direita) e y = linha (0 = superfície,
11 = fundo, para baixo); centro da casa nos inteiros. No mundo, o terrário fica no banquinho com o
centro em (0; 1,09; -0,42) m, de frente para o jogador (x = 0, z = 0 olhando para -z). Converter:
`cellPos` / `posCell` em `scene.js` (metros no terrário, y para cima).

## Regras e convenções do projeto

- `vec.js`, `sim.js`, `levels.js` e `robot.js` não podem usar navegador nem Three.js: os testes
  rodam no Node.
- `scene.js` desenha o terrário com as medidas de `CELL`/`TANK` do `sim.js` e `W`/`H` do `levels.js`.
- Fase nova ou mudada: seguir a legenda de `levels.js` (14 x 12, linha de cima só '.', pedra sem túnel
  embaixo), rodar `node tests/run.js` e conferir o tempo efetivo do robô; `par` tem que deixar o robô
  com 2 estrelas ou mais com folga (3 estrelas perto do tempo típico dele).
- Mexeu em regras, bichos, chefes ou robô: rodar `node tests/run.js`.
- Eventos do jogo (`game.events`) são a única ponte da lógica para som, vibração e efeitos.
- A física roda em passos fixos de 1/120 s. A entrada do passo é `{ tx, ty }` (alvo na grade, do dedo
  ou mouse) ou `{ dir }` (teclado), mais `pump`.

## Decisões

- O dedo guia a formiga, mas ela anda na grade com velocidade limitada: dá a sensação de "puxar" a
  formiga sem teletransporte, e o jogo continua justo.
- A bomba sai na direção em que a formiga olha (como no gênero): para mirar, a formiga dá um passo
  para o lado do bicho.
- O rinoceronte não infla (precisa de pedra), e a bomba que segura ele cansa: senão era só ficar
  bombeando para sempre. Sempre nascem pedras novas nessa fase.
- A aranha atravessa a terra o tempo todo (é cristal), mas para para tecer: aí é a hora de bombear.
- O último bicho que escapa também conta como fim de fase (sem os pontos), como no gênero.
- Conforto: jogador parado, câmera do VR nunca mexida pelo jogo; o terrário pode vir para perto do
  rosto com a mão, mas o mundo não se mexe.
- Estrelas por tempo (com 20 s de multa por vida perdida), calibradas pelo robô.
- Desempenho de Quest: pixelRatio 1, foveação, a terra inteira numa textura de canvas (redesenhada só
  quando cava), brasa em InstancedMesh, enfeites juntados numa malha só, partículas num só `Points`,
  2 luzes sem sombra, sem pós-processamento.
- Porta do servidor local 8876.

## Pendências / problemas conhecidos

- **Nada foi testado no Quest ainda**: guiar com a ponta do controle encostada no vidro (distância
  e sensibilidade), pegar e soltar o terrário, a ponta do indicador e a pinça com rastreamento de
  mãos, recentralizar, vibração, conforto e FPS no óculos.
- Sons e música só foram checados por não dar erro; ninguém ouviu ainda.
- A dificuldade foi calibrada pelo robô; as fases 1 e 5 são curtas (o robô faz em ~10-20 s) e o
  rinoceronte (fase 4) é a mais longa e a que mais varia. Pode estar fácil ou difícil para gente de
  verdade. Os limites de estrela estão em `par` de cada fase.
- No PC o robô do menu (demonstração) pode dar pequenos travamentos quando decide; no VR o robô não
  roda no menu.
