'use strict';
/* ==========================================================
   DADOS DO JOGO: constantes, golpes, combos e personagens
   ========================================================== */
const W = 960, H = 540, GROUND = 488;
const ROUND_TIME = 60;        // segundos por round
const ROUNDS_TO_WIN = 2;      // melhor de 3
const MAX_ROUNDS = 5;
const GRAV = 0.85, SPEED = 3.4, JUMP_V = 16, STEP = 1000 / 60;
const PCOL = ['#ff3d6e', '#29d3ff', '#4dff9a', '#ffd23f'];   // cor de cada jogador
const ST = ['idle', 'walk', 'jump', 'block', 'punch', 'kick', 'special', 'hit', 'ko', 'win'];
const MVL = ['p1', 'p2', 'p3', 'k1', 'k2', 'k3', 'special'];   // golpes (vai pela rede)

// su = startup, ac = frames ativos, rc = recuperação (60 frames = 1s)
// n = próximo golpe do combo (só vale se o golpe atual acertou): p = soco, k = chute, s = 1 -> cancela no especial
const ATK = {
  p1: { su: 4, ac: 3, rc: 9,  reach: 56, dmg: 5,  hs: 13, kb: 3,  y1: 135, y2: 88, n: { p: 'p2', k: 'k1', s: 1 } },
  p2: { su: 5, ac: 3, rc: 10, reach: 62, dmg: 6,  hs: 14, kb: 4,  y1: 132, y2: 86, n: { p: 'p3', k: 'k3', s: 1 } },
  p3: { su: 7, ac: 4, rc: 18, reach: 66, dmg: 10, hs: 24, kb: 8,  y1: 160, y2: 70, launch: 1, n: { s: 1 } },   // gancho: lança no ar
  k1: { su: 8, ac: 5, rc: 14, reach: 80, dmg: 9,  hs: 18, kb: 7,  y1: 125, y2: 30, n: { k: 'k2', p: 'p2', s: 1 } },
  k2: { su: 8, ac: 4, rc: 13, reach: 84, dmg: 8,  hs: 17, kb: 6,  y1: 70,  y2: 10, n: { k: 'k3', p: 'p3', s: 1 } },   // rasteira
  k3: { su: 10, ac: 5, rc: 20, reach: 92, dmg: 13, hs: 28, kb: 12, y1: 140, y2: 30, launch: 1, n: { s: 1 } }         // chute giratório
};
// especiais: cada lutador escolhe um tipo em sp.t
const SPA = {
  ball: { su: 16, ac: 2, rc: 28 },                                  // bola de energia
  tri:  { su: 14, ac: 14, rc: 24 },                                 // rajada de 3 tiros
  big:  { su: 22, ac: 2, rc: 34 },                                  // esfera gigante que atravessa
  rush: { su: 8, ac: 14, rc: 24, reach: 62, dmg: 11, hs: 22, kb: 9, y1: 140, y2: 20, v: 10 },    // investida
  rise: { su: 5, ac: 18, rc: 32, reach: 58, dmg: 13, hs: 30, kb: 5, y1: 190, y2: 40, launch: 1 }  // golpe ascendente
};
const spA = ch => SPA[ch.sp.t];

/* Personalidade: quote (fala no início), win (fala ao vencer), bob = [ritmo, amplitude] da respiração,
   stride = passada, lean = postura, brow = sobrancelha (3 brava, 0 calma, -1 relaxada), sm = sorriso (-2 sério, 3 sorrisão) */
const CHARS = [
  { id: 'mike', name: 'MIKE', title: 'Punho de Fogo', quote: 'Vem que eu tô esquentado!', win: 'Fogo no parquinho!',
    skin: '#e6b087', hair: '#241610', hs: 'band', band: '#d62828', ec: '#3a2a1a', brow: 3, sm: 2, bob: [0.1, 1.4],
    gi: '#f4f4f4', upper: '#f4f4f4', fore: '#e6b087', fist: '#e6b087', wrap: '#d62828', pad: '#d62828', emb: 'flame', embc: '#ff6a2b',
    pants: '#f4f4f4', shin: '#f4f4f4', belt: '#c81e1e', shoe: '#b3202a',
    spd: 1, pow: 1, hp: 100, jump: 1, reach: 1, scale: 1, sp: { t: 'ball' }, spn: 'Bola de Fogo',
    proj: { col: '#ff6a2b', col2: '#ffe08a', r: 17, v: 9, dmg: 1 } },

  { id: 'lee', name: 'LEE', title: 'Mestre do Trovão', quote: 'Calma. O trovão não avisa.', win: 'Velocidade também é disciplina.',
    skin: '#f0c8a0', hair: '#12151c', hs: 'spiky', ec: '#2a4fd0', brow: 0, sm: 0, bob: [0.07, 0.8], stride: 0.27,
    gi: '#fbfbfb', upper: '#fbfbfb', fore: '#f0c8a0', fist: '#f0c8a0', wrap: '#2a4fd0', emb: 'bolt', embc: '#47a8ff',
    pants: '#fbfbfb', shin: '#fbfbfb', belt: '#2a4fd0', shoe: '#1c1c24',
    spd: 1.1, pow: 0.95, hp: 96, jump: 1.05, reach: 1, scale: 1, sp: { t: 'tri' }, spn: 'Três Raios',
    proj: { col: '#47a8ff', col2: '#e8f6ff', r: 16, v: 10, dmg: 1 } },

  { id: 'kira', name: 'KIRA', title: 'Chute Relâmpago', quote: 'Pisca e você já perdeu!', win: 'Fácil demais. Próxima!',
    skin: '#eebf9d', hair: '#7a2cc9', hs: 'pony', ec: '#8e3be0', brow: 4, sm: 3, bob: [0.14, 1.6], stride: 0.3, scarf: '#ffd34d',
    gi: '#8e3be0', upper: '#8e3be0', fore: '#eebf9d', fist: '#ffd34d', emb: 'star', embc: '#ffd34d',
    pants: '#2d1b4d', shin: '#2d1b4d', belt: '#ffd34d', shoe: '#ffd34d',
    spd: 1.2, pow: 0.85, hp: 90, jump: 1.12, reach: 1.1, scale: 0.96, sp: { t: 'rush' }, spn: 'Chute Cometa',
    proj: { col: '#c25bff', col2: '#f5dcff', r: 14, v: 11, dmg: 1 } },

  { id: 'bruno', name: 'BRUNO', title: 'Muralha de Aço', quote: 'Pode bater. Eu espero.', win: 'Isso foi só o aquecimento.',
    skin: '#b97a50', hair: '#2b1a10', hs: 'bald', beard: '#2b1a10', ec: '#2b1a10', brow: 1, sm: -1, bob: [0.05, 0.9], stride: 0.18, lean: -2,
    gi: '#2f8f3f', upper: '#b97a50', fore: '#b97a50', fist: '#a31d1d', gloveR: 9, emb: 'diamond', embc: '#ffd23f',
    pants: '#4a3a2a', shin: '#4a3a2a', belt: '#1b1b1b', shoe: '#2a2a2a',
    spd: 0.82, pow: 1.3, hp: 120, jump: 0.9, reach: 1, scale: 1.12, sp: { t: 'ball' }, spn: 'Esfera de Aço',
    proj: { col: '#59e05f', col2: '#e5ffe0', r: 23, v: 7, dmg: 1.05 } },

  { id: 'yuki', name: 'YUKI', title: 'Sombra Ninja', quote: '...', win: 'Você nunca me viu.',
    skin: '#f1d0b0', hair: '#101018', hs: 'ninja', band: '#00e5ff', ec: '#00bcd4', brow: 1, sm: 0, bob: [0.12, 0.6], stride: 0.3, scarf: '#00e5ff',
    gi: '#1c1f2e', upper: '#1c1f2e', fore: '#1c1f2e', fist: '#00bcd4', wrap: '#00bcd4',
    pants: '#1c1f2e', shin: '#1c1f2e', belt: '#00e5ff', shoe: '#0f111a',
    spd: 1.25, pow: 0.8, hp: 88, jump: 1.22, reach: 0.95, scale: 0.95, sp: { t: 'ball' }, spn: 'Shuriken de Luz',
    proj: { col: '#19e6ff', col2: '#e0fcff', r: 11, v: 13, dmg: 1 } },

  { id: 'rex', name: 'REX', title: 'Rei do Ringue', quote: 'O ringue é meu!', win: 'E o campeão é... EU!',
    skin: '#d49a63', hair: '#161616', hs: 'mohawk', ec: '#161616', brow: 3, sm: 3, bob: [0.1, 1.8], lean: 3,
    gi: '#d49a63', upper: '#d49a63', fore: '#d49a63', fist: '#d62d2d', gloveR: 8, emb: 'diamond', embc: '#f2c40f',
    pants: '#f2c40f', shin: '#d49a63', belt: '#161616', shoe: '#161616',
    spd: 1.05, pow: 1.1, hp: 104, jump: 1, reach: 1.12, scale: 1.04, sp: { t: 'rush' }, spn: 'Investida Real',
    proj: { col: '#ffd23f', col2: '#fff4c2', r: 18, v: 9.5, dmg: 1 } },

  { id: 'luna', name: 'LUNA', title: 'Dançarina da Lua', quote: 'Joga bonito, que eu danço!', win: 'Ginga é arte, amigo.',
    skin: '#9b6a4a', hair: '#1a0f0a', hs: 'braid', band: '#2ee6a6', ec: '#1a0f0a', brow: -1, sm: 3, bob: [0.15, 2.2], stride: 0.3,
    gi: '#1fb89a', upper: '#9b6a4a', fore: '#9b6a4a', fist: '#2ee6a6', wrap: '#2ee6a6', emb: 'ring', embc: '#ffffff',
    pants: '#f4f4f4', shin: '#f4f4f4', belt: '#2ee6a6', shoe: '#9b6a4a',
    spd: 1.18, pow: 0.9, hp: 94, jump: 1.15, reach: 1.08, scale: 0.98, sp: { t: 'rise' }, spn: 'Meia-Lua Solar',
    proj: { col: '#2ee6a6', col2: '#e0fff4', r: 13, v: 10.5, dmg: 1 } },

  { id: 'volt', name: 'VOLT', title: 'Ciborgue Elétrico', quote: 'Carregando... 100%. Hora de lutar.', win: 'Missão cumprida. Bip.',
    skin: '#b8c4cf', hair: '#2a2f3a', hs: 'visor', visor: '#ff3355', ec: '#ff3355', brow: 3, sm: 0, bob: [0.2, 0.5], stride: 0.2,
    gi: '#2b3040', upper: '#aab4c0', fore: '#7f8c99', fist: '#ffd23f', pad: '#ffd23f', emb: 'bolt', embc: '#ffd23f',
    pants: '#2b3040', shin: '#7f8c99', belt: '#ffd23f', shoe: '#ffd23f',
    spd: 0.95, pow: 1.2, hp: 108, jump: 0.95, reach: 1.05, scale: 1.08, sp: { t: 'big' }, spn: 'Orbe Tesla',
    proj: { col: '#ffe93b', col2: '#fffbd0', r: 17, v: 8, dmg: 1.1 } },

  { id: 'gran', name: 'GRAN', title: 'Sábio da Montanha', quote: 'A paciência vence a juventude.', win: 'Ainda falta muito, jovem.',
    skin: '#d9a982', hair: '#f0f0f0', hs: 'oldman', beard: '#f5f5f5', ec: '#3a2a1a', brow: 0, sm: 1, bob: [0.05, 0.6], stride: 0.2, lean: -3,
    gi: '#d98c2b', upper: '#d98c2b', fore: '#d9a982', fist: '#d9a982', wrap: '#f5f5f5', emb: 'ring', embc: '#5a2a12',
    pants: '#8a5a2a', shin: '#f0e6d0', belt: '#5a2a12', shoe: '#3a2a1a',
    spd: 0.9, pow: 1.15, hp: 102, jump: 0.95, reach: 1, scale: 1, sp: { t: 'rise' }, spn: 'Dragão Ascendente',
    proj: { col: '#fff1a8', col2: '#ffffff', r: 16, v: 9, dmg: 1.05 } },

  { id: 'dante', name: 'DANTE', title: 'Astro Escarlate', quote: 'Estilo primeiro, vitória depois.', win: 'Fim de show. Aplaudam.',
    skin: '#e9b793', hair: '#1a1a1a', hs: 'slick', acc: 'shades', ec: '#1a1a1a', brow: 2, sm: 3, bob: [0.11, 1.6], lean: 2, scarf: '#ffd23f',
    gi: '#c1121f', upper: '#c1121f', fore: '#e9b793', fist: '#111111', emb: 'diamond', embc: '#ffd23f',
    pants: '#14141a', shin: '#14141a', belt: '#ffd23f', shoe: '#111111',
    spd: 1.12, pow: 1, hp: 98, jump: 1.05, reach: 1.06, scale: 1.02, sp: { t: 'tri' }, spn: 'Rajada Escarlate',
    proj: { col: '#ff2d55', col2: '#ffd1dc', r: 14, v: 11.5, dmg: 1 } }
];

// Esquemas de teclado (usa e.code, então funciona em qualquer layout)
const SCHEMES = [
  { l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS', p: 'KeyF', k: 'KeyG', s: 'KeyH' },
  { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown', p: 'Comma', k: 'Period', s: 'Slash' },
  { l: 'KeyJ', r: 'KeyL', u: 'KeyI', d: 'KeyK', p: 'KeyU', k: 'KeyO', s: 'KeyP' },
  { l: 'Numpad4', r: 'Numpad6', u: 'Numpad8', d: 'Numpad5', p: 'Numpad7', k: 'Numpad9', s: 'Numpad0' }
];
const KEYHELP = [
  'A / D mover · W pular · S defender · F soco · G chute · H especial',
  '← / → mover · ↑ pular · ↓ defender · , soco · . chute · ; especial',
  'J / L mover · I pular · K defender · U soco · O chute · P especial',
  'Numpad 4 / 6 mover · 8 pular · 5 defender · 7 soco · 9 chute · 0 especial'
];
