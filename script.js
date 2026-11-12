'use strict';

/* =========================================================================
   ŠKOLNÍ HLÍDKA — 2D top-down hra
   -------------------------------------------------------------------------
   Kód je záměrně rozdělený do malých sekcí:
   1. konfigurace a datová mapa pater,
   2. generátor tilemap,
   3. stav hry a herní logika,
   4. AI učitelů,
   5. vykreslování,
   6. vstup a herní smyčka.

   Rozšíření:
   - další patro = přidat objekt do FLOOR_CONFIGS,
   - nová místnost = přidat položku do pole top/bottom daného patra,
   - nový typ učitele = rozšířit createTeachers/updateEnemies,
   - power-up = přidat ho do stavu hry a testovat v updateGame.
   Učitel se vytvoří automaticky pro každou místnost typu "cabinet".
   ========================================================================= */

/* ------------------------------ 1. KONFIGURACE ------------------------- */

const TILE = Object.freeze({
  WALL: 0,     // neprůchozí zeď
  HALL: 1,     // podlaha chodby
  ROOM: 2,     // podlaha učebny / kabinetu
  DOOR: 3,     // průchozí dveře
  STAIRS: 4,   // schodiště — po vstupu změní patro
});

const MAP = Object.freeze({
  WIDTH: 60,
  HEIGHT: 18,
  TILE_SIZE: 32,
  ROOM_START_X: 5,
  ROOM_SPAN_END: 55,          // první sloupec za poslední místností
  CORRIDOR_TOP: 7,
  CORRIDOR_BOTTOM: 10,
  TOP_DOOR_ROW: 6,
  TOP_ROOM_TOP: 1,
  TOP_ROOM_BOTTOM: 5,
  BOTTOM_DOOR_ROW: 11,
  BOTTOM_ROOM_TOP: 12,
  BOTTOM_ROOM_BOTTOM: 16,
  STAIR_LEFT_FROM: 1,
  STAIR_LEFT_TO: 4,
  STAIR_RIGHT_FROM: 55,
  STAIR_RIGHT_TO: 58,
});

const VIEW = Object.freeze({ WIDTH: 960, HEIGHT: 576 });
const TASK_SCORE = 100;
const MAX_LIVES = 3;
const FLOOR_SWITCH_COOLDOWN = 0.95;

const PLAYER_CONFIG = Object.freeze({
  width: 16,
  height: 18,
  speed: 160,
});

const TEACHER_CONFIG = Object.freeze({
  width: 18,
  height: 20,
  patrolSpeed: 43,
  chaseSpeed: 108,
  patrolRange: 50,
  alertTime: 1.7,
});

/*
 * Úrovně agresivity učitelů:
 * - passive    = neutrální / pasivní, sám nikoho nepronásleduje, chytá jen kontaktem,
 * - mild       = mírně agresivní, pronásleduje jen na velmi krátkou vzdálenost,
 * - aggressive = agresivní, používá plný dosah pronásledování.
 */
const AGGRESSION = Object.freeze({
  passive: { label: 'pasivní', detectionRange: 0 },
  mild: { label: 'mírně agresivní', detectionRange: 105 },
  aggressive: { label: 'agresivní', detectionRange: 196 },
});

const ITEM_TYPES = Object.freeze({
  apple: {
    label: 'okousané jablko',
    slowDuration: 2.4,
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#d95d50" d="M12.1 6.3c-1.8-1.2-4.3-.7-5.7 1.2-2 2.7-1.2 6.4 1 8.8 1.3 1.4 2.9 2 4.7.9 1.8 1.1 3.4.5 4.7-.9 2.2-2.4 3-6.1 1-8.8-1.4-1.9-3.9-2.4-5.7-1.2Z"/>
      <path fill="#f3e6c8" d="M16 7.5c1 .8 1.6 2.4 1.4 3.8-.2 1.3-.8 2.3-1.6 3.1.8-2.1.9-4.8.2-6.9Z"/>
      <path fill="#628e47" d="M12.4 5.8c.3-1.7 1.5-2.7 3.2-2.9-.1 1.6-1.4 2.8-3.2 2.9Z"/>
      <path fill="none" stroke="#6e4728" stroke-width="1.4" stroke-linecap="round" d="M12.1 6.1V3.5"/>
    </svg>`,
  },
  banana: {
    label: 'šlupka od banánu',
    slowDuration: 3.2,
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#f2c94c" d="M5.2 4.6c1.7 4.6 5.7 7.3 10.9 6.5l1.8-.3c-.4 1.9-1.9 3.2-4 3.5-5.4.8-9.5-2-11-7l2.3-2.7Z"/>
      <path fill="#ffe28a" d="M8.1 5.9c2.1 2.8 5 4.2 8.6 4.3-3 .4-5.7-.5-7.7-2.5l-.9-1.8Z"/>
      <path fill="#c89a2e" d="M4.8 4.2c2.6.9 4.8 2.6 6.4 4.9-2.5-.6-4.7-2.2-6.4-4.9Z"/>
      <path fill="#f2c94c" d="M17.4 10.9c1.4.2 2.6.9 3.4 2.1-1.3.4-2.7.1-3.7-.8l.3-1.3Z"/>
      <path fill="#f2c94c" d="M10.3 14.4c.7 1.6.5 3.2-.5 4.6-1-1.2-1.2-2.8-.5-4.4l1-.2Z"/>
      <path fill="#f2c94c" d="M13.8 14c.3 1.7 1.2 3 2.6 3.9.2-1.6-.4-3.1-1.7-4.1l-.9.2Z"/>
    </svg>`,
  },
  tissue: {
    label: 'posmrkaný kapesník',
    slowDuration: 2.8,
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#f2f5ee" stroke="#b7c4bc" stroke-width="1.1" stroke-linejoin="round" d="m6.4 7.1 3.2-2.8 3.6 1.8 3.1-.9 2.2 3.5-1.5 3.2 1 3.6-3.6 2.2-3.1-1.5-3.4.9-2.3-3.4 1.5-3.2-1.1-3.4Z"/>
      <path fill="#dce6df" d="m9.6 6.7 2.6-1.5-.2 4.5-3.1 2.9.1-4.2.6-1.7Z"/>
      <path fill="#a6cbb2" d="M9.6 11.6c1.2-1.2 3.4-1.2 4.7 0 .8.8.5 1.9-.6 1.9-.9 0-1-.9-1.8-.9-.7 0-.9 1-1.8.9-.9-.1-1.3-1.1-.5-1.9Z"/>
    </svg>`,
  },
});

const ITEM_KEYS = Object.freeze(Object.keys(ITEM_TYPES));
const INVENTORY_LIMIT = 3;
const PICKUP_RESPAWN_TIME = 14;
const PICKUP_REACH = 27;
const THROW_SPEED = 430;
const THROW_LIFETIME = 0.95;
const TEACHER_SLOW_FACTOR = 0.32;

/*
 * Datová definice pater.
 *
 * top / bottom = pořadí místností zleva doprava.
 * width = šířka segmentu v dlaždicích (generátor ji případně znormalizuje).
 * type:
 *   "classroom" = cílová učebna,
 *   "cabinet"   = kabinet, u kterého se objeví učitel.
 *   aggression  = passive | mild | aggressive (viz AGGRESSION výše).
 *
 * Chceš-li přidat další patro, zkopíruj blok a změň label + seznam místností.
 */
const FLOOR_CONFIGS = [
  {
    label: '1. patro',
    top: [
      { name: 'U10', type: 'classroom', width: 8 },
      { name: 'U11', type: 'classroom', width: 8 },
      { name: 'K1', type: 'cabinet', width: 7, teacher: 'EH', aggression: 'aggressive' },
      { name: 'U12', type: 'classroom', width: 9 },
      { name: 'U13', type: 'classroom', width: 9 },
      { name: 'U14', type: 'classroom', width: 9 },
    ],
    bottom: [
      { name: 'U15', type: 'classroom', width: 9 },
      { name: 'K2', type: 'cabinet', width: 7, teacher: 'MV', aggression: 'passive' },
      { name: 'U16', type: 'classroom', width: 8 },
      { name: 'U17', type: 'classroom', width: 9 },
      { name: 'U18', type: 'classroom', width: 8 },
      { name: 'U19', type: 'classroom', width: 9 },
    ],
  },
  {
    label: '2. patro',
    top: [
      { name: 'U20', type: 'classroom', width: 8 },
      { name: 'U21', type: 'classroom', width: 9 },
      { name: 'K3', type: 'cabinet', width: 7, teacher: 'JH', aggression: 'passive' },
      { name: 'U22', type: 'classroom', width: 8 },
      { name: 'U23', type: 'classroom', width: 9 },
      { name: 'U24', type: 'classroom', width: 9 },
    ],
    bottom: [
      { name: 'U25', type: 'classroom', width: 9 },
      { name: 'U26', type: 'classroom', width: 8 },
      { name: 'U27', type: 'classroom', width: 8 },
      { name: 'K4', type: 'cabinet', width: 7, teacher: 'DM', aggression: 'mild' },
      { name: 'U28', type: 'classroom', width: 9 },
      { name: 'U29', type: 'classroom', width: 9 },
    ],
  },
  {
    label: '3. patro',
    top: [
      { name: 'U30', type: 'classroom', width: 9 },
      { name: 'K5', type: 'cabinet', width: 7, teacher: 'DS', aggression: 'mild' },
      { name: 'U31', type: 'classroom', width: 8 },
      { name: 'U32', type: 'classroom', width: 9 },
      { name: 'U33', type: 'classroom', width: 9 },
      { name: 'U34', type: 'classroom', width: 8 },
    ],
    bottom: [
      { name: 'U35', type: 'classroom', width: 8 },
      { name: 'U36', type: 'classroom', width: 9 },
      { name: 'U37', type: 'classroom', width: 9 },
      { name: 'K6', type: 'cabinet', width: 7, teacher: 'JP', aggression: 'aggressive' },
      { name: 'U38', type: 'classroom', width: 9 },
      { name: 'U39', type: 'classroom', width: 8 },
    ],
  },
  {
    label: '4. patro',
    top: [
      { name: 'U40', type: 'classroom', width: 7 },
      { name: 'U41', type: 'classroom', width: 7 },
      { name: 'K7', type: 'cabinet', width: 6, teacher: 'JD', aggression: 'aggressive' },
      { name: 'U42', type: 'classroom', width: 8 },
      { name: 'K8', type: 'cabinet', width: 7, teacher: 'JK', aggression: 'passive' },
      { name: 'U43', type: 'classroom', width: 8 },
      { name: 'U44', type: 'classroom', width: 7 },
    ],
    bottom: [
      { name: 'U45', type: 'classroom', width: 9 },
      { name: 'U46', type: 'classroom', width: 10 },
      { name: 'U47', type: 'classroom', width: 10 },
      { name: 'U48', type: 'classroom', width: 11 },
      { name: 'U49', type: 'classroom', width: 10 },
    ],
  },
];

/* ------------------------------ DOM PRVKY ------------------------------ */

const dom = {
  canvas: document.getElementById('game'),
  floorPills: document.getElementById('floor-pills'),
  taskName: document.getElementById('task-name'),
  taskFloor: document.getElementById('task-floor'),
  statDone: document.getElementById('stat-done'),
  statTime: document.getElementById('stat-time'),
  statScore: document.getElementById('stat-score'),
  lives: document.getElementById('lives'),
  backpack: document.getElementById('backpack'),
  backpackSlots: document.getElementById('backpack-slots'),
  toast: document.getElementById('toast'),
  startScreen: document.getElementById('start-screen'),
  pauseScreen: document.getElementById('pause-screen'),
  gameoverScreen: document.getElementById('gameover-screen'),
  gameoverReason: document.getElementById('gameover-reason'),
  finalStats: document.getElementById('final-stats'),
  startButton: document.getElementById('start-button'),
  resumeButton: document.getElementById('resume-button'),
  restartButton: document.getElementById('restart-button'),
};

const ctx = dom.canvas.getContext('2d');
let renderScale = 1;
let game = null;
let toastTimer = 0;
const keys = new Set();
const pointer = {
  active: false,
  x: VIEW.WIDTH / 2,
  y: VIEW.HEIGHT / 2,
};

/* ------------------------------ POMOCNÉ FUNKCE ------------------------- */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60).toString().padStart(2, '0');
  const secs = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
}

function lifeNoun(count) {
  if (count === 1) return 'život';
  if (count >= 2 && count <= 4) return 'životy';
  return 'životů';
}

function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function aabbOverlap(a, b, padding = 0) {
  return !(
    a.x + a.w / 2 + padding < b.x - b.w / 2 ||
    a.x - a.w / 2 - padding > b.x + b.w / 2 ||
    a.y + a.h / 2 + padding < b.y - b.h / 2 ||
    a.y - a.h / 2 - padding > b.y + b.h / 2
  );
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

/* --------------------------- 2. GENERÁTOR MAP -------------------------- */

// Upraví šířky místností tak, aby přesně vyplnily dostupnou délku budovy.
function normaliseRoomWidths(rooms, totalWidth) {
  const MIN_WIDTH = 4;
  const requested = rooms.map((room) => Math.max(MIN_WIDTH, Number(room.width) || 6));
  const requestedTotal = requested.reduce((sum, width) => sum + width, 0);
  const widths = requested.map((width) =>
    Math.max(MIN_WIDTH, Math.floor((width / requestedTotal) * totalWidth))
  );

  let difference = totalWidth - widths.reduce((sum, width) => sum + width, 0);

  while (difference > 0) {
    widths[widths.length - 1] += 1;
    difference -= 1;
  }

  while (difference < 0) {
    const widestIndex = widths.indexOf(Math.max(...widths));
    if (widths[widestIndex] <= MIN_WIDTH) break;
    widths[widestIndex] -= 1;
    difference += 1;
  }

  return widths;
}

// Vyrobí jednu stranu místností (horní nebo dolní) a zapíše je do tilemapy.
function carveRoomSide(tiles, roomDefinitions, side, floorIndex) {
  const rooms = [];
  const isTop = side === 'top';
  const availableWidth = MAP.ROOM_SPAN_END - MAP.ROOM_START_X;
  const widths = normaliseRoomWidths(roomDefinitions, availableWidth);
  const interiorTop = isTop ? MAP.TOP_ROOM_TOP : MAP.BOTTOM_ROOM_TOP;
  const interiorBottom = isTop ? MAP.TOP_ROOM_BOTTOM : MAP.BOTTOM_ROOM_BOTTOM;
  const doorRow = isTop ? MAP.TOP_DOOR_ROW : MAP.BOTTOM_DOOR_ROW;

  let cursor = MAP.ROOM_START_X;

  roomDefinitions.forEach((definition, index) => {
    const width = widths[index];
    const segmentEnd = cursor + width;
    const interiorStart = cursor + 1;
    const interiorEnd = segmentEnd - 1;
    const type = definition.type === 'cabinet' ? 'cabinet' : 'classroom';

    // Interiér místnosti (stěny zůstávají z výchozího vyplnění).
    for (let y = interiorTop; y <= interiorBottom; y += 1) {
      for (let x = interiorStart; x <= interiorEnd; x += 1) {
        tiles[y][x] = TILE.ROOM;
      }
    }

    // Dveře přesně doprostřed místnosti, přímo do chodby.
    const doorX = Math.floor((interiorStart + interiorEnd) / 2);
    tiles[doorRow][doorX] = TILE.DOOR;

    rooms.push({
      key: `f${floorIndex}-${side}-${index}`,
      floorIndex,
      name: definition.name,
      type,
      side,
      width,
      teacher: definition.teacher || null,
      aggression: AGGRESSION[definition.aggression]
        ? definition.aggression
        : 'aggressive',
      interiorStart,
      interiorEnd,
      door: {
        x: doorX * MAP.TILE_SIZE + MAP.TILE_SIZE / 2,
        y: doorRow * MAP.TILE_SIZE + MAP.TILE_SIZE / 2,
        tileX: doorX,
        tileY: doorRow,
      },
      bounds: {
        x: interiorStart * MAP.TILE_SIZE,
        y: interiorTop * MAP.TILE_SIZE,
        w: (interiorEnd - interiorStart + 1) * MAP.TILE_SIZE,
        h: (interiorBottom - interiorTop + 1) * MAP.TILE_SIZE,
      },
      // Jemné barevné odlišení podlahy místnosti.
      tint:
        type === 'cabinet'
          ? 'rgba(236, 171, 70, 0.075)'
          : index % 2 === 0
            ? 'rgba(72, 154, 132, 0.065)'
            : 'rgba(86, 135, 175, 0.055)',
    });

    cursor = segmentEnd;
  });

  return rooms;
}

// Sestaví kompletní tilemapu jednoho patra z datové konfigurace.
function buildFloorMap(config, floorIndex) {
  const tiles = Array.from({ length: MAP.HEIGHT }, () =>
    Array(MAP.WIDTH).fill(TILE.WALL)
  );

  // Dlouhá chodba přes celou budovu.
  for (let y = MAP.CORRIDOR_TOP; y <= MAP.CORRIDOR_BOTTOM; y += 1) {
    for (let x = 1; x < MAP.WIDTH - 1; x += 1) {
      tiles[y][x] = TILE.HALL;
    }
  }

  // Dvě schodiště na koncích chodby.
  for (let y = MAP.CORRIDOR_TOP; y <= MAP.CORRIDOR_BOTTOM; y += 1) {
    for (let x = MAP.STAIR_LEFT_FROM; x <= MAP.STAIR_LEFT_TO; x += 1) {
      tiles[y][x] = TILE.STAIRS;
    }
    for (let x = MAP.STAIR_RIGHT_FROM; x <= MAP.STAIR_RIGHT_TO; x += 1) {
      tiles[y][x] = TILE.STAIRS;
    }
  }

  const topRooms = carveRoomSide(tiles, config.top, 'top', floorIndex);
  const bottomRooms = carveRoomSide(tiles, config.bottom, 'bottom', floorIndex);

  return {
    config,
    floorIndex,
    tiles,
    rooms: [...topRooms, ...bottomRooms],
    pixelWidth: MAP.WIDTH * MAP.TILE_SIZE,
    pixelHeight: MAP.HEIGHT * MAP.TILE_SIZE,
  };
}

// Učitelé vzniknou automaticky u každého kabinetu.
function createTeachers(floorMap) {
  return floorMap.rooms
    .filter((room) => room.type === 'cabinet')
    .map((room, index) => {
      const laneY =
        room.side === 'top'
          ? (MAP.CORRIDOR_TOP + 0.7) * MAP.TILE_SIZE
          : (MAP.CORRIDOR_BOTTOM - 0.7) * MAP.TILE_SIZE;

      return {
        id: `teacher-${room.key}`,
        name: room.teacher || 'Učitel',
        aggression: room.aggression,
        detectionRange: AGGRESSION[room.aggression].detectionRange,
        roomKey: room.key,
        x: room.door.x,
        y: laneY,
        w: TEACHER_CONFIG.width,
        h: TEACHER_CONFIG.height,
        homeX: room.door.x,
        homeY: laneY,
        patrolMin: room.door.x - TEACHER_CONFIG.patrolRange,
        patrolMax: room.door.x + TEACHER_CONFIG.patrolRange,
        patrolDirection: index % 2 === 0 ? 1 : -1,
        state: 'patrol',      // patrol | chase | return
        alert: 0,
        stun: 0,
        slowTimer: 0,
        walkTime: Math.random() * 10,
        facing: 1,
      };
    });
}

function shuffleItemTypes() {
  const types = [...ITEM_KEYS];
  for (let index = types.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [types[index], types[swapIndex]] = [types[swapIndex], types[index]];
  }
  return types;
}

function findPickupSpot(floorMap, enemies, occupied) {
  const minX = (MAP.ROOM_START_X + 1.5) * MAP.TILE_SIZE;
  const maxX = (MAP.ROOM_SPAN_END - 1.5) * MAP.TILE_SIZE;
  const minY = (MAP.CORRIDOR_TOP + 0.45) * MAP.TILE_SIZE;
  const maxY = (MAP.CORRIDOR_BOTTOM + 0.55) * MAP.TILE_SIZE;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = lerp(minX, maxX, Math.random());
    const y = lerp(minY, maxY, Math.random());
    const farFromItems = occupied.every(
      (pickup) => !pickup.active || distance(x, y, pickup.x, pickup.y) > 105
    );
    const farFromTeachers = enemies.every(
      (enemy) => distance(x, y, enemy.homeX, enemy.homeY) > 75
    );

    if (farFromItems && farFromTeachers) return { x, y };
  }

  return {
    x: lerp(minX, maxX, Math.random()),
    y: (MAP.CORRIDOR_TOP + 2) * MAP.TILE_SIZE,
  };
}

function createFloorPickups(floorMap, enemies) {
  const pickups = [];
  const types = shuffleItemTypes();

  types.forEach((type, index) => {
    const spot = findPickupSpot(floorMap, enemies, pickups);
    pickups.push({
      id: `pickup-${floorMap.floorIndex}-${index}`,
      type,
      x: spot.x,
      y: spot.y,
      active: true,
      respawnTimer: 0,
      phase: Math.random() * Math.PI * 2,
    });
  });

  return pickups;
}

function respawnPickup(floorMap, pickup) {
  const occupied = floorMap.pickups.filter((other) => other !== pickup);
  const spot = findPickupSpot(floorMap, floorMap.enemies, occupied);
  pickup.type = randomChoice(ITEM_KEYS);
  pickup.x = spot.x;
  pickup.y = spot.y;
  pickup.phase = Math.random() * Math.PI * 2;
  pickup.respawnTimer = 0;
  pickup.active = true;
}

function buildAllFloors() {
  return FLOOR_CONFIGS.map((config, index) => {
    const floorMap = buildFloorMap(config, index);
    const enemies = createTeachers(floorMap);
    return {
      ...floorMap,
      enemies,
      pickups: createFloorPickups(floorMap, enemies),
    };
  });
}

/* ------------------------- 3. STAV A HERNÍ LOGIKA ---------------------- */

function getFloorMap(floorIndex = game.floorIndex) {
  return game.floors[floorIndex];
}

// Bezpečný bod u levého/pravého schodiště.
function getFloorEntry(floorIndex, side) {
  const x =
    side === 'right'
      ? (MAP.ROOM_SPAN_END - 1.5) * MAP.TILE_SIZE
      : (MAP.ROOM_START_X + 1.5) * MAP.TILE_SIZE;

  return {
    floorIndex,
    x,
    y: (MAP.CORRIDOR_TOP + MAP.CORRIDOR_BOTTOM + 1) * 0.5 * MAP.TILE_SIZE,
  };
}

function createPlayer(floorIndex = 0) {
  const entry = getFloorEntry(floorIndex, 'left');
  return {
    x: entry.x,
    y: entry.y,
    w: PLAYER_CONFIG.width,
    h: PLAYER_CONFIG.height,
    speed: PLAYER_CONFIG.speed,
    facing: 1,
    aimX: 1,
    aimY: 0,
    walkPhase: 0,
    moving: false,
    invuln: 0,
  };
}

function createGameState() {
  const floors = buildAllFloors();
  const player = createPlayer(0);
  const entry = getFloorEntry(0, 'left');

  return {
    mode: 'start', // start | playing | paused | gameover
    floors,
    floorIndex: 0,
    player,
    cameraX: 0,
    elapsed: 0,
    lives: MAX_LIVES,
    score: 0,
    completed: 0,
    task: null,
    recentTasks: [],
    inventory: [],
    projectiles: [],
    throwCooldown: 0,
    bagNoticeCooldown: 0,
    emptyBagNoticeCooldown: 0,
    stairCooldown: 0.6,
    safePos: entry,
    safeTimer: 0.4,
    shake: 0,
    damageFlash: 0,
    floorFlash: 0,
    lastClockText: '',
  };
}

function resetEnemiesOnFloor(floorIndex) {
  for (const enemy of game.floors[floorIndex].enemies) {
    enemy.x = enemy.homeX;
    enemy.y = enemy.homeY;
    enemy.state = 'patrol';
    enemy.alert = 0;
    enemy.stun = 0.35;
    enemy.slowTimer = 0;
    enemy.facing = enemy.patrolDirection;
  }
}

function startNewGame() {
  game = createGameState();
  game.mode = 'playing';
  keys.clear();
  dom.startScreen.hidden = true;
  dom.pauseScreen.hidden = true;
  dom.gameoverScreen.hidden = true;
  setCameraImmediately();
  chooseNextTask(null, { preferFloor: 0 });
  updateHud();
  showToast('Zvoní! Najdi svou první učebnu.', 'info', 1900);
}

function pauseGame() {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  keys.clear();
  dom.pauseScreen.hidden = false;
}

function resumeGame() {
  if (game.mode !== 'paused') return;
  game.mode = 'playing';
  keys.clear();
  dom.pauseScreen.hidden = true;
}

function togglePause() {
  if (game.mode === 'playing') {
    pauseGame();
  } else if (game.mode === 'paused') {
    resumeGame();
  }
}

function endGame(reason) {
  game.mode = 'gameover';
  keys.clear();
  game.player.moving = false;
  window.clearTimeout(toastTimer);
  dom.toast.className = 'toast';
  dom.gameoverReason.textContent = reason;
  dom.finalStats.innerHTML = `
    <div class="final-stat"><span>Splněno</span><strong>${game.completed}</strong></div>
    <div class="final-stat"><span>Skóre</span><strong>${game.score}</strong></div>
    <div class="final-stat"><span>Čas</span><strong>${formatTime(game.elapsed)}</strong></div>
  `;
  dom.gameoverScreen.hidden = false;
  updateHud();
}

// Kontakt s učitelem: ztráta života, reset a krátká nesmrtelnost.
function handleCaught(enemy) {
  if (game.mode !== 'playing' || game.player.invuln > 0) return;

  game.lives -= 1;
  game.shake = 0.48;
  game.damageFlash = 1;
  game.player.invuln = 2.2;
  resetEnemiesOnFloor(game.floorIndex);
  updateHud();

  if (game.lives <= 0) {
    endGame(`Učitel ${enemy.name} tě dostal. Poznámka do žákovské knížky.`);
    return;
  }

  const safe = game.safePos;
  const safeIsUsable =
    safe &&
    safe.floorIndex === game.floorIndex &&
    game.floors[game.floorIndex].enemies.every(
      (teacher) => distance(safe.x, safe.y, teacher.x, teacher.y) > 170
    );

  const respawn = safeIsUsable ? safe : getFloorEntry(game.floorIndex, 'left');

  game.player.x = respawn.x;
  game.player.y = respawn.y;
  game.player.moving = false;
  game.stairCooldown = 0.4;
  game.safePos = { floorIndex: game.floorIndex, x: respawn.x, y: respawn.y };
  setCameraImmediately();

  const verb = game.lives === 1 ? 'zbývá' : 'zbývají';
  showToast(
    `Chycen! ${enemy.name} · ${verb} ${game.lives} ${lifeNoun(game.lives)}`,
    'danger',
    2400
  );
}

// Přechod na další patro. Obě schodiště vedou na stejné místo budovy.
function switchFloor(entrySide) {
  const nextFloor = (game.floorIndex + 1) % game.floors.length;
  game.floorIndex = nextFloor;

  const entry = getFloorEntry(nextFloor, entrySide);
  game.player.x = entry.x;
  game.player.y = entry.y;
  game.player.moving = false;
  game.player.invuln = Math.max(game.player.invuln, 0.35);
  game.stairCooldown = FLOOR_SWITCH_COOLDOWN;
  game.floorFlash = 0.85;
  game.projectiles = [];
  game.safePos = entry;
  game.safeTimer = 0.8;

  resetEnemiesOnFloor(nextFloor);
  setCameraImmediately();
  updateHud();
  showToast(`Schodiště → ${game.floors[nextFloor].config.label}`, 'info', 1300);
}

function checkStairs() {
  if (game.stairCooldown > 0) return;

  const tile = tileAt(game.floorIndex, game.player.x, game.player.y);
  if (tile !== TILE.STAIRS) return;

  // Po příchodu na schodiště zůstane hráč na stejném konci budovy.
  const side =
    game.player.x < (MAP.WIDTH * MAP.TILE_SIZE) / 2 ? 'left' : 'right';
  switchFloor(side);
}

/* ---------------------------- ÚKOLY A SKÓRE ---------------------------- */

function getTaskPool() {
  return game.floors.flatMap((floor) =>
    floor.rooms.filter((room) => room.type === 'classroom')
  );
}

function getRoomByKey(floorIndex, roomKey) {
  return game.floors[floorIndex].rooms.find((room) => room.key === roomKey) || null;
}

function chooseNextTask(previousTask = null, options = {}) {
  let candidates = getTaskPool();

  // Neopakuj stejnou učebnu a snaž se střídat lokace.
  const recent = new Set(game.recentTasks);
  const withoutRecent = candidates.filter((room) => !recent.has(room.key));
  if (withoutRecent.length > 0) candidates = withoutRecent;

  if (previousTask) {
    const withoutPrevious = candidates.filter((room) => room.key !== previousTask.roomKey);
    if (withoutPrevious.length > 0) candidates = withoutPrevious;
  }

  if (typeof options.preferFloor === 'number') {
    const onPreferredFloor = candidates.filter(
      (room) => room.floorIndex === options.preferFloor
    );
    if (onPreferredFloor.length > 0) candidates = onPreferredFloor;
  }

  const target = randomChoice(candidates);
  game.task = {
    roomKey: target.key,
    floorIndex: target.floorIndex,
    name: target.name,
  };

  game.recentTasks.push(target.key);
  if (game.recentTasks.length > 5) {
    game.recentTasks.shift();
  }

  updateHud();
  bumpTaskName();
}

function completeTask(room) {
  game.completed += 1;
  game.score += TASK_SCORE;
  showToast(`Úkol splněn: ${room.name}  +${TASK_SCORE}`, 'success', 2100);

  const previousTask = game.task;
  game.task = null;
  updateHud();
  chooseNextTask(previousTask);
}

function checkTaskCompletion() {
  if (!game.task || game.task.floorIndex !== game.floorIndex) return;

  const room = getRoomByKey(game.floorIndex, game.task.roomKey);
  if (!room) return;

  if (pointInRect(game.player.x, game.player.y, room.bounds)) {
    completeTask(room);
  }
}

// Aktualizuje poslední bezpečné místo, kam se hráč po chycení vrací.
function updateSafePosition(dt) {
  game.safeTimer -= dt;
  if (game.safeTimer > 0) return;
  game.safeTimer = 0.45;

  const player = game.player;
  if (tileAt(game.floorIndex, player.x, player.y) !== TILE.HALL) return;
  if (game.stairCooldown > 0) return;

  const enemyIsClose = game.floors[game.floorIndex].enemies.some(
    (enemy) => distance(player.x, player.y, enemy.x, enemy.y) < 175
  );

  if (!enemyIsClose) {
    game.safePos = { floorIndex: game.floorIndex, x: player.x, y: player.y };
  }
}

/* ------------------------ 4. POHYB A KOLIZE --------------------------- */

function tileAt(floorIndex, pixelX, pixelY) {
  const tileX = Math.floor(pixelX / MAP.TILE_SIZE);
  const tileY = Math.floor(pixelY / MAP.TILE_SIZE);

  if (tileX < 0 || tileX >= MAP.WIDTH || tileY < 0 || tileY >= MAP.HEIGHT) {
    return TILE.WALL;
  }

  return game.floors[floorIndex].tiles[tileY][tileX];
}

function entityCollides(entity, tiles) {
  const left = entity.x - entity.w / 2;
  const right = entity.x + entity.w / 2;
  const top = entity.y - entity.h / 2;
  const bottom = entity.y + entity.h / 2;

  const startX = Math.floor(left / MAP.TILE_SIZE);
  const endX = Math.floor((right - 0.001) / MAP.TILE_SIZE);
  const startY = Math.floor(top / MAP.TILE_SIZE);
  const endY = Math.floor((bottom - 0.001) / MAP.TILE_SIZE);

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      if (x < 0 || x >= MAP.WIDTH || y < 0 || y >= MAP.HEIGHT) return true;
      if (tiles[y][x] === TILE.WALL) return true;
    }
  }

  return false;
}

// Pohyb po malých krocích + osamostatněné osy = plynulé klouzání podél zdí.
function moveEntity(entity, dx, dy, tiles) {
  const maxStep = MAP.TILE_SIZE * 0.45;
  const steps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep)
  );
  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let step = 0; step < steps; step += 1) {
    entity.x += stepX;
    if (entityCollides(entity, tiles)) entity.x -= stepX;

    entity.y += stepY;
    if (entityCollides(entity, tiles)) entity.y -= stepY;
  }
}

function updatePlayer(dt) {
  const player = game.player;
  player.invuln = Math.max(0, player.invuln - dt);

  let inputX = 0;
  let inputY = 0;

  if (keys.has('ArrowLeft') || keys.has('KeyA')) inputX -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) inputX += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) inputY -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) inputY += 1;

  const length = Math.hypot(inputX, inputY);
  player.moving = length > 0;

  if (length > 0) {
    inputX /= length;
    inputY /= length;
    player.aimX = inputX;
    player.aimY = inputY;
    const step = player.speed * dt;
    const tiles = getFloorMap().tiles;
    moveEntity(player, inputX * step, inputY * step, tiles);

    if (inputX !== 0) player.facing = Math.sign(inputX);
    player.walkPhase += dt * 12;
  }
}

/* ---------------------------- 5. AI UČITELŮ ---------------------------- */

function moveTeacherToward(enemy, targetX, targetY, speed, dt) {
  const dx = targetX - enemy.x;
  const dy = targetY - enemy.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.001) return;

  const step = Math.min(speed * dt, length);
  const velocityX = (dx / length) * step;
  const velocityY = (dy / length) * step;
  moveEntity(enemy, velocityX, velocityY, getFloorMap().tiles);

  if (Math.abs(velocityX) > 0.01) enemy.facing = Math.sign(velocityX);
}

function updateEnemies(dt) {
  if (game.mode !== 'playing') return;

  const player = game.player;
  const enemies = game.floors[game.floorIndex].enemies;

  for (const enemy of enemies) {
    enemy.stun = Math.max(0, enemy.stun - dt);
    enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
    if (enemy.stun > 0) continue;

    const speedScale = enemy.slowTimer > 0 ? TEACHER_SLOW_FACTOR : 1;
    enemy.walkTime += dt * (enemy.state === 'chase' ? 9 : 4) * speedScale;

    const playerDistance = distance(enemy.x, enemy.y, player.x, player.y);

    // Detekce hráče podle úrovně agresivity učitele.
    // Pasivní učitel má dosah 0, takže sám nikdy nezačne pronásledovat.
    if (enemy.detectionRange > 0 && playerDistance < enemy.detectionRange) {
      enemy.state = 'chase';
      enemy.alert = TEACHER_CONFIG.alertTime;
    } else if (enemy.state === 'chase') {
      enemy.alert -= dt;
      if (enemy.alert <= 0) enemy.state = 'return';
    }

    if (enemy.state === 'chase') {
      moveTeacherToward(
        enemy,
        player.x,
        player.y,
        TEACHER_CONFIG.chaseSpeed * speedScale,
        dt
      );
    } else if (enemy.state === 'return') {
      moveTeacherToward(
        enemy,
        enemy.homeX,
        enemy.homeY,
        TEACHER_CONFIG.patrolSpeed * speedScale,
        dt
      );
      if (distance(enemy.x, enemy.y, enemy.homeX, enemy.homeY) < 4) {
        enemy.state = 'patrol';
      }
    } else {
      // Jednoduchá hlídka: přecházení mezi dvěma body před kabinetem.
      const targetX =
        enemy.patrolDirection > 0 ? enemy.patrolMax : enemy.patrolMin;
      moveTeacherToward(
        enemy,
        targetX,
        enemy.homeY,
        TEACHER_CONFIG.patrolSpeed * speedScale,
        dt
      );

      if (Math.abs(enemy.x - targetX) < 3) {
        enemy.patrolDirection *= -1;
      }
    }

    // Kontakt = chycení.
    if (aabbOverlap(player, enemy, 2)) {
      handleCaught(enemy);
      if (game.mode !== 'playing') return;
    }
  }
}

function updatePickups(dt) {
  game.bagNoticeCooldown = Math.max(0, game.bagNoticeCooldown - dt);
  game.emptyBagNoticeCooldown = Math.max(0, game.emptyBagNoticeCooldown - dt);
  game.throwCooldown = Math.max(0, game.throwCooldown - dt);

  for (const floorMap of game.floors) {
    for (const pickup of floorMap.pickups) {
      if (pickup.active) continue;
      pickup.respawnTimer -= dt;
      if (pickup.respawnTimer <= 0) respawnPickup(floorMap, pickup);
    }
  }

  if (game.mode !== 'playing') return;

  const player = game.player;

  for (const pickup of getFloorMap().pickups) {
    if (!pickup.active) continue;
    if (distance(player.x, player.y, pickup.x, pickup.y) > PICKUP_REACH) continue;

    if (game.inventory.length >= INVENTORY_LIMIT) {
      if (game.bagNoticeCooldown <= 0) {
        showToast(
          `Batoh je plný (${INVENTORY_LIMIT}/${INVENTORY_LIMIT}). Něco hoď klávesou E.`,
          'info',
          1500
        );
        game.bagNoticeCooldown = 2.4;
      }
      continue;
    }

    pickup.active = false;
    pickup.respawnTimer = PICKUP_RESPAWN_TIME;
    game.inventory.push({ type: pickup.type });
    updateBackpack();
    showToast(
      `Sebráno: ${ITEM_TYPES[pickup.type].label} (${game.inventory.length}/${INVENTORY_LIMIT}). E = hodit.`,
      'info',
      1500
    );
  }
}

function getThrowDirection() {
  const player = game.player;

  if (pointer.active) {
    const targetX = pointer.x + game.cameraX;
    const targetY = pointer.y;
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const length = Math.hypot(dx, dy);

    if (length > 2) {
      return { x: dx / length, y: dy / length };
    }
  }

  const aimLength = Math.hypot(player.aimX, player.aimY) || 1;
  return {
    x: player.aimX / aimLength,
    y: player.aimY / aimLength,
  };
}

function throwItem() {
  if (game.mode !== 'playing' || game.throwCooldown > 0) return;

  if (game.inventory.length === 0) {
    if (game.emptyBagNoticeCooldown <= 0) {
      showToast('Batoh je prázdný. Najdi odpadky na zemi.', 'info', 1300);
      game.emptyBagNoticeCooldown = 1.8;
    }
    return;
  }

  const item = game.inventory.shift();
  const direction = getThrowDirection();
  const player = game.player;

  game.throwCooldown = 0.18;
  game.projectiles.push({
    type: item.type,
    floorIndex: game.floorIndex,
    x: player.x + direction.x * 18,
    y: player.y + direction.y * 18,
    w: 12,
    h: 12,
    vx: direction.x * THROW_SPEED,
    vy: direction.y * THROW_SPEED,
    life: THROW_LIFETIME,
    angle: 0,
    spin: (Math.random() - 0.5) * 12,
  });

  updateBackpack();
}

function applyItemHit(enemy, type) {
  const item = ITEM_TYPES[type] || ITEM_TYPES.apple;
  enemy.slowTimer = Math.max(enemy.slowTimer, item.slowDuration);
  const seconds = item.slowDuration.toFixed(1).replace('.', ',');
  showToast(
    `Zásah: ${item.label}! ${enemy.name} – zpomalení ${seconds} s.`,
    'success',
    1800
  );
}

function updateProjectiles(dt) {
  if (game.projectiles.length === 0) return;

  const floorMap = getFloorMap();
  const remaining = [];

  for (const projectile of game.projectiles) {
    if (projectile.floorIndex !== game.floorIndex) continue;

    projectile.life -= dt;
    if (projectile.life <= 0) continue;

    const travel = Math.hypot(projectile.vx, projectile.vy) * dt;
    const steps = Math.max(1, Math.ceil(travel / (MAP.TILE_SIZE * 0.35)));
    const stepX = (projectile.vx * dt) / steps;
    const stepY = (projectile.vy * dt) / steps;
    let hit = false;

    for (let step = 0; step < steps; step += 1) {
      projectile.x += stepX;
      projectile.y += stepY;
      projectile.angle += (projectile.spin * dt) / steps;

      if (tileAt(game.floorIndex, projectile.x, projectile.y) === TILE.WALL) {
        hit = true;
        break;
      }

      for (const enemy of floorMap.enemies) {
        if (aabbOverlap(projectile, enemy, 2)) {
          applyItemHit(enemy, projectile.type);
          hit = true;
          break;
        }
      }

      if (hit) break;
    }

    if (!hit) remaining.push(projectile);
  }

  game.projectiles = remaining;
}

/* --------------------------- KAMERA A ČAS ------------------------------ */

function getCameraTarget() {
  const maxCamera = Math.max(0, getFloorMap().pixelWidth - VIEW.WIDTH);
  return clamp(game.player.x - VIEW.WIDTH / 2, 0, maxCamera);
}

function setCameraImmediately() {
  game.cameraX = getCameraTarget();
}

function updateCamera(dt) {
  const target = getCameraTarget();
  game.cameraX = lerp(game.cameraX, target, 1 - Math.pow(0.0005, dt));
}

function updateClock() {
  const text = formatTime(game.elapsed);
  if (text !== game.lastClockText) {
    game.lastClockText = text;
    dom.statTime.textContent = text;
  }
}

/* ------------------------- 6. HERNÍ AKTUALIZACE ------------------------ */

function updateGame(dt) {
  game.elapsed += dt;
  game.stairCooldown = Math.max(0, game.stairCooldown - dt);

  updatePlayer(dt);
  updateCamera(dt);
  checkStairs();

  if (game.mode !== 'playing') return;

  updateEnemies(dt);
  if (game.mode !== 'playing') return;

  updateProjectiles(dt);
  updatePickups(dt);
  checkTaskCompletion();
  updateSafePosition(dt);
  updateClock();

  game.shake = Math.max(0, game.shake - dt * 1.8);
  game.damageFlash = Math.max(0, game.damageFlash - dt * 2.2);
  game.floorFlash = Math.max(0, game.floorFlash - dt * 2.6);
}

/* ---------------------------- 7. VYKRESLOVÁNÍ -------------------------- */

function setupCanvas() {
  renderScale = Math.min(window.devicePixelRatio || 1, 2);
  dom.canvas.width = Math.round(VIEW.WIDTH * renderScale);
  dom.canvas.height = Math.round(VIEW.HEIGHT * renderScale);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
}

function drawTile(tile, tileX, tileY, tiles) {
  const x = tileX * MAP.TILE_SIZE;
  const y = tileY * MAP.TILE_SIZE;
  const size = MAP.TILE_SIZE;

  if (tile === TILE.HALL) {
    ctx.fillStyle = (tileX + tileY) % 2 === 0 ? '#e4d6ba' : '#dfcfb1';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = 'rgba(103, 84, 52, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    // Drobný detail spáry dlažby.
    if ((tileX * 3 + tileY * 5) % 7 === 0) {
      ctx.fillStyle = 'rgba(87, 69, 40, 0.08)';
      ctx.fillRect(x + 7, y + 14, 18, 2);
    }
    return;
  }

  if (tile === TILE.ROOM) {
    ctx.fillStyle = (tileX + tileY) % 2 === 0 ? '#d3e1d6' : '#cfddd2';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = 'rgba(54, 91, 73, 0.09)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    return;
  }

  if (tile === TILE.DOOR) {
    ctx.fillStyle = '#2a3d53';
    ctx.fillRect(x, y, size, size);

    const horizontalDoor = tileY === MAP.TOP_DOOR_ROW || tileY === MAP.BOTTOM_DOOR_ROW;
    if (horizontalDoor) {
      ctx.fillStyle = '#8f5b30';
      roundedRect(ctx, x + 5, y + 3, size - 10, size - 6, 4);
      ctx.fill();
      ctx.fillStyle = '#b77842';
      roundedRect(ctx, x + 8, y + 6, size - 16, size - 12, 2);
      ctx.fill();
      ctx.fillStyle = '#efb354';
      ctx.beginPath();
      ctx.arc(x + size - 10, y + size / 2, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (tile === TILE.STAIRS) {
    ctx.fillStyle = '#526a77';
    ctx.fillRect(x, y, size, size);

    // Jednotlivé stupně.
    for (let step = 0; step < 4; step += 1) {
      ctx.fillStyle = step % 2 === 0 ? '#5e7885' : '#4a616e';
      ctx.fillRect(x + 2, y + step * 8 + 2, size - 4, 4);
    }

    ctx.fillStyle = 'rgba(220, 235, 240, 0.22)';
    ctx.fillRect(x + 2, y + 2, 2, size - 4);
    return;
  }

  // Zeď — tmavá základna a světlejší hrany sousedící s podlahou.
  ctx.fillStyle = '#263b51';
  ctx.fillRect(x, y, size, size);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  const walkable = (tx, ty) => {
    if (tx < 0 || tx >= MAP.WIDTH || ty < 0 || ty >= MAP.HEIGHT) return false;
    return tiles[ty][tx] !== TILE.WALL;
  };

  if (walkable(tileX, tileY + 1)) {
    ctx.fillStyle = '#3c5872';
    ctx.fillRect(x, y + size - 5, size, 5);
  }
  if (walkable(tileX, tileY - 1)) {
    ctx.fillStyle = '#1a2a3c';
    ctx.fillRect(x, y, size, 4);
  }
  if (walkable(tileX - 1, tileY)) {
    ctx.fillStyle = '#304b63';
    ctx.fillRect(x, y, 4, size);
  }
  if (walkable(tileX + 1, tileY)) {
    ctx.fillStyle = '#304b63';
    ctx.fillRect(x + size - 4, y, 4, size);
  }
}

function drawFloor(floorMap) {
  const camX = Math.round(game.cameraX);
  const firstTile = Math.max(0, Math.floor(camX / MAP.TILE_SIZE) - 1);
  const lastTile = Math.min(
    MAP.WIDTH - 1,
    Math.ceil((camX + VIEW.WIDTH) / MAP.TILE_SIZE) + 1
  );

  for (let y = 0; y < MAP.HEIGHT; y += 1) {
    for (let x = firstTile; x <= lastTile; x += 1) {
      drawTile(floorMap.tiles[y][x], x, y, floorMap.tiles);
    }
  }

  // Jemné tónování podlah jednotlivých místností.
  for (const room of floorMap.rooms) {
    if (
      room.bounds.x + room.bounds.w < camX ||
      room.bounds.x > camX + VIEW.WIDTH
    ) {
      continue;
    }
    ctx.fillStyle = room.tint;
    ctx.fillRect(room.bounds.x, room.bounds.y, room.bounds.w, room.bounds.h);
  }
}

function drawStairLabels(floorMap) {
  const camX = Math.round(game.cameraX);
  const stairCenters = [
    ((MAP.STAIR_LEFT_FROM + MAP.STAIR_LEFT_TO + 1) / 2) * MAP.TILE_SIZE,
    ((MAP.STAIR_RIGHT_FROM + MAP.STAIR_RIGHT_TO + 1) / 2) * MAP.TILE_SIZE,
  ];
  const centerY =
    ((MAP.CORRIDOR_TOP + MAP.CORRIDOR_BOTTOM + 1) / 2) * MAP.TILE_SIZE;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const centerX of stairCenters) {
    if (centerX < camX - 100 || centerX > camX + VIEW.WIDTH + 100) continue;

    ctx.fillStyle = 'rgba(8, 19, 31, 0.5)';
    roundedRect(ctx, centerX - 34, centerY - 12, 68, 24, 6);
    ctx.fill();

    ctx.fillStyle = 'rgba(227, 239, 244, 0.9)';
    ctx.font = '800 9px "Segoe UI", sans-serif';
    ctx.fillText('SCHODY', centerX, centerY - 1);
    ctx.fillStyle = 'rgba(239, 179, 84, 0.95)';
    ctx.font = '700 9px "Segoe UI", sans-serif';
    ctx.fillText('↕ patro', centerX, centerY + 9);
  }

  ctx.restore();
}

function drawRoomLabels(floorMap) {
  const camX = Math.round(game.cameraX);

  for (const room of floorMap.rooms) {
    if (
      room.bounds.x + room.bounds.w < camX ||
      room.bounds.x > camX + VIEW.WIDTH
    ) {
      continue;
    }

    const centerX = room.bounds.x + room.bounds.w / 2;
    const centerY = room.bounds.y + room.bounds.h / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle =
      room.type === 'cabinet' ? 'rgba(122, 78, 21, 0.9)' : 'rgba(37, 78, 67, 0.92)';
    ctx.font = '900 17px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.fillText(room.name, centerX, centerY - 3);

    ctx.fillStyle =
      room.type === 'cabinet' ? 'rgba(136, 94, 37, 0.62)' : 'rgba(54, 92, 79, 0.56)';
    ctx.font = '800 8px "Segoe UI", sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText(
      room.type === 'cabinet' ? 'KABINET' : 'UČEBNA',
      centerX,
      centerY + 13
    );
    ctx.letterSpacing = '0px';
  }
}

function drawTargetMarker(floorMap) {
  if (!game.task || game.task.floorIndex !== game.floorIndex) return;

  const room = getRoomByKey(game.floorIndex, game.task.roomKey);
  if (!room) return;

  const pulse = (Math.sin(performance.now() / 230) + 1) / 2;
  const bounds = room.bounds;

  ctx.save();
  ctx.fillStyle = `rgba(255, 200, 93, ${0.045 + pulse * 0.055})`;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

  ctx.strokeStyle = `rgba(255, 199, 91, ${0.45 + pulse * 0.4})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([9, 7]);
  ctx.lineDashOffset = -performance.now() / 42;
  roundedRect(ctx, bounds.x + 4, bounds.y + 4, bounds.w - 8, bounds.h - 8, 7);
  ctx.stroke();
  ctx.setLineDash([]);

  // Šipka/„CÍL“ před dveřmi ve chodbě.
  const markerY =
    room.side === 'top' ? room.door.y + 29 : room.door.y - 29;
  const label = 'CÍL';

  ctx.translate(room.door.x, markerY);
  ctx.fillStyle = 'rgba(239, 179, 84, 0.95)';
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(-6, -2);
  ctx.lineTo(6, -2);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.6 + pulse * 0.4;
  ctx.fillStyle = '#f8e9c5';
  ctx.font = '900 9px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, -9);
  ctx.restore();
}

function drawItemIcon(context, type, x, y, scale = 1, angle = 0) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.scale(scale, scale);

  if (type === 'apple') {
    context.fillStyle = '#d95d50';
    context.beginPath();
    context.moveTo(0, -4);
    context.bezierCurveTo(-8, -8, -10, 2, -5, 7);
    context.bezierCurveTo(-2, 10, 1, 8, 2, 6);
    context.bezierCurveTo(4, 9, 9, 5, 9, 0);
    context.bezierCurveTo(9, -5, 5, -8, 0, -4);
    context.fill();

    context.fillStyle = '#f3e6c8';
    context.beginPath();
    context.arc(5.5, -0.5, 3.1, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = '#6e4728';
    context.lineWidth = 1.3;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(0, -4);
    context.lineTo(1, -8.5);
    context.stroke();

    context.fillStyle = '#628e47';
    context.beginPath();
    context.ellipse(3.1, -8, 3, 1.5, -0.5, 0, Math.PI * 2);
    context.fill();
  } else if (type === 'banana') {
    context.fillStyle = '#f2c94c';
    context.strokeStyle = '#c89a2e';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-9, -6);
    context.quadraticCurveTo(0, 7, 9, -4);
    context.quadraticCurveTo(1, 10, -9, -6);
    context.fill();
    context.stroke();

    context.fillStyle = '#ffe28a';
    context.beginPath();
    context.moveTo(-7, -5.5);
    context.quadraticCurveTo(0, 2, 7, -3.8);
    context.quadraticCurveTo(0, 4, -7, -5.5);
    context.fill();

    context.strokeStyle = '#d5a82f';
    context.lineWidth = 1.1;
    context.beginPath();
    context.moveTo(-2, 1);
    context.lineTo(-4, 7);
    context.moveTo(1, 2.5);
    context.lineTo(2, 8);
    context.moveTo(4.5, 1);
    context.lineTo(7, 4.5);
    context.stroke();

    context.fillStyle = '#8a6a22';
    context.beginPath();
    context.arc(9, -4, 1.2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.fillStyle = '#f2f5ee';
    context.strokeStyle = '#b7c4bc';
    context.lineWidth = 1;
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(-8, -6);
    context.lineTo(-2, -8);
    context.lineTo(3, -5);
    context.lineTo(8, -7);
    context.lineTo(7, 0);
    context.lineTo(9, 5);
    context.lineTo(2, 7);
    context.lineTo(-3, 5);
    context.lineTo(-8, 6);
    context.lineTo(-6, 0);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = '#dce6df';
    context.beginPath();
    context.moveTo(-5, -5);
    context.lineTo(-1, -6);
    context.lineTo(0, 1);
    context.lineTo(-4, 2);
    context.closePath();
    context.fill();

    context.fillStyle = '#a6cbb2';
    context.beginPath();
    context.ellipse(1, 1.5, 3.3, 2, -0.2, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawPickups(floorMap) {
  const player = game.player;

  for (const pickup of floorMap.pickups) {
    if (!pickup.active) continue;

    const bob = Math.sin(game.elapsed * 2.4 + pickup.phase) * 2;

    ctx.fillStyle = 'rgba(9, 22, 29, 0.18)';
    ctx.beginPath();
    ctx.ellipse(pickup.x, pickup.y + 9, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(239, 179, 84, 0.13)';
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y + bob, 15, 0, Math.PI * 2);
    ctx.fill();

    drawItemIcon(ctx, pickup.type, pickup.x, pickup.y + bob, 1, 0);

    if (distance(player.x, player.y, pickup.x, pickup.y) > 80) continue;

    const label = ITEM_TYPES[pickup.type].label;
    ctx.font = '800 8px "Segoe UI", sans-serif';
    const textWidth = Math.ceil(ctx.measureText(label).width);
    const labelWidth = textWidth + 10;
    const labelY = pickup.y - 18;

    ctx.fillStyle = 'rgba(7, 17, 29, 0.78)';
    roundedRect(ctx, pickup.x - labelWidth / 2, labelY - 7, labelWidth, 14, 4);
    ctx.fill();

    ctx.fillStyle = '#f5e7c6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pickup.x, labelY);
  }
}

function drawProjectiles(floorMap) {
  for (const projectile of game.projectiles) {
    if (projectile.floorIndex !== floorMap.floorIndex) continue;

    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(projectile.angle);
    drawItemIcon(ctx, projectile.type, 0, 0, 0.86, 0);
    ctx.restore();
  }
}

function drawAimGuide() {
  if (
    game.mode !== 'playing' ||
    !pointer.active ||
    game.inventory.length === 0
  ) {
    return;
  }

  const player = game.player;
  const targetX = pointer.x + game.cameraX;
  const targetY = pointer.y;

  if (distance(player.x, player.y, targetX, targetY) < 24) return;

  ctx.save();
  ctx.strokeStyle = 'rgba(239, 179, 84, 0.42)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 7]);
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(targetX, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(255, 210, 125, 0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(targetX, targetY, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(targetX - 11, targetY);
  ctx.lineTo(targetX - 4, targetY);
  ctx.moveTo(targetX + 4, targetY);
  ctx.lineTo(targetX + 11, targetY);
  ctx.moveTo(targetX, targetY - 11);
  ctx.lineTo(targetX, targetY - 4);
  ctx.moveTo(targetX, targetY + 4);
  ctx.lineTo(targetX, targetY + 11);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  const player = game.player;
  const bob = player.moving ? Math.sin(player.walkPhase) * 1.6 : 0;
  const blink =
    player.invuln > 0 && Math.floor(player.invuln * 11) % 2 === 0;

  ctx.save();
  ctx.translate(player.x, player.y + bob);
  if (blink) ctx.globalAlpha = 0.4;

  // Stín.
  ctx.fillStyle = 'rgba(9, 22, 29, 0.24)';
  ctx.beginPath();
  ctx.ellipse(0, 15, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nohy.
  const legSwing = player.moving ? Math.sin(player.walkPhase) * 3 : 0;
  ctx.fillStyle = '#274154';
  roundedRect(ctx, -7, 7 + legSwing * 0.25, 5, 9, 2);
  ctx.fill();
  roundedRect(ctx, 2, 7 - legSwing * 0.25, 5, 9, 2);
  ctx.fill();

  // Batoh za tělem.
  ctx.fillStyle = '#d29a3d';
  roundedRect(ctx, -11, -4, 5, 12, 2.5);
  ctx.fill();

  // Tělo / mikina.
  ctx.fillStyle = '#58bd94';
  ctx.strokeStyle = '#173d34';
  ctx.lineWidth = 2;
  roundedRect(ctx, -9, -5, 18, 16, 5);
  ctx.fill();
  ctx.stroke();

  // Světlý pruh na mikině.
  ctx.fillStyle = 'rgba(235, 255, 247, 0.45)';
  ctx.fillRect(-9, 2, 18, 2);

  // Hlava.
  ctx.fillStyle = '#f0c497';
  ctx.strokeStyle = '#4d3728';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, -11, 7.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Vlasy.
  ctx.fillStyle = '#553725';
  ctx.beginPath();
  ctx.arc(0, -12.5, 7.4, Math.PI, Math.PI * 2);
  ctx.lineTo(7.4, -10);
  ctx.lineTo(-7.4, -10);
  ctx.closePath();
  ctx.fill();

  // Oči podle směru pohledu.
  ctx.fillStyle = '#27313a';
  const eyeOffset = player.facing * 1.2;
  ctx.beginPath();
  ctx.arc(-2.7 + eyeOffset, -10.4, 1.05, 0, Math.PI * 2);
  ctx.arc(2.7 + eyeOffset, -10.4, 1.05, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawTeacher(enemy) {
  const bob = Math.sin(enemy.walkTime) * (enemy.state === 'chase' ? 2 : 1);
  const chasing = enemy.state === 'chase';
  const slowed = enemy.slowTimer > 0;

  ctx.save();
  ctx.translate(enemy.x, enemy.y + bob);

  if (chasing) {
    ctx.strokeStyle = 'rgba(240, 107, 103, 0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 15, 15, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (slowed) {
    ctx.strokeStyle = 'rgba(239, 179, 84, 0.78)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.ellipse(0, 16, 19, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Stín.
  ctx.fillStyle = 'rgba(9, 22, 29, 0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 15, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nohy.
  const legSwing = Math.sin(enemy.walkTime) * 2.2;
  ctx.fillStyle = '#28323e';
  roundedRect(ctx, -7, 7, 5, 9 + legSwing * 0.2, 2);
  ctx.fill();
  roundedRect(ctx, 2, 7, 5, 9 - legSwing * 0.2, 2);
  ctx.fill();

  // Sako.
  ctx.fillStyle = chasing ? '#a54b4b' : '#76513f';
  ctx.strokeStyle = '#35262b';
  ctx.lineWidth = 2;
  roundedRect(ctx, -9, -5, 18, 16, 4.5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f2e6d2';
  ctx.beginPath();
  ctx.moveTo(-3, -4);
  ctx.lineTo(0, 1);
  ctx.lineTo(3, -4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = chasing ? '#f06b67' : '#b08a4e';
  ctx.fillRect(-1, -1, 2, 6);

  // Hlava a brýle.
  ctx.fillStyle = '#e8bf95';
  ctx.strokeStyle = '#4d3728';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -11, 7.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#6f6a63';
  ctx.beginPath();
  ctx.arc(0, -13, 7.2, Math.PI, Math.PI * 2);
  ctx.lineTo(7.2, -10);
  ctx.lineTo(-7.2, -10);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#313943';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-5.2, -11.7, 4.2, 3);
  ctx.strokeRect(1, -11.7, 4.2, 3);
  ctx.beginPath();
  ctx.moveTo(-1, -10.3);
  ctx.lineTo(1, -10.3);
  ctx.stroke();

  // Jmenovka učitele nad hlavou.
  ctx.font = '800 9px "Segoe UI", sans-serif';
  const nameWidth = Math.ceil(ctx.measureText(enemy.name).width);
  const tagWidth = nameWidth + 14;
  const tagHeight = 16;
  const tagY = -40;

  ctx.fillStyle = 'rgba(7, 17, 29, 0.84)';
  ctx.strokeStyle = chasing
    ? 'rgba(240, 107, 103, 0.85)'
    : slowed
      ? 'rgba(239, 179, 84, 0.8)'
      : 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  roundedRect(ctx, -tagWidth / 2, tagY, tagWidth, tagHeight, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = chasing
    ? '#ffd4d1'
    : slowed
      ? '#ffe2a8'
      : 'rgba(245, 238, 223, 0.96)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(enemy.name, 0, tagY + tagHeight / 2 + 0.5);

  if (chasing) {
    // Vykřičník nad jmenovkou.
    ctx.fillStyle = 'rgba(240, 107, 103, 0.96)';
    roundedRect(ctx, -7, -60, 14, 14, 4.5);
    ctx.fill();

    ctx.fillStyle = '#1b2430';
    ctx.font = '900 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, -53);
  }

  ctx.restore();
}

function drawEffects() {
  if (game.floorFlash > 0) {
    ctx.fillStyle = `rgba(184, 231, 232, ${game.floorFlash * 0.22})`;
    ctx.fillRect(0, 0, VIEW.WIDTH, VIEW.HEIGHT);
  }

  if (game.damageFlash > 0) {
    const gradient = ctx.createRadialGradient(
      VIEW.WIDTH / 2,
      VIEW.HEIGHT / 2,
      VIEW.HEIGHT * 0.2,
      VIEW.WIDTH / 2,
      VIEW.HEIGHT / 2,
      VIEW.HEIGHT * 0.76
    );
    gradient.addColorStop(0, 'rgba(240, 107, 103, 0)');
    gradient.addColorStop(1, `rgba(171, 33, 42, ${game.damageFlash * 0.58})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.WIDTH, VIEW.HEIGHT);
  }

  // Jemné ztmavení okrajů pro atmosféru.
  const vignette = ctx.createRadialGradient(
    VIEW.WIDTH / 2,
    VIEW.HEIGHT / 2,
    VIEW.HEIGHT * 0.3,
    VIEW.WIDTH / 2,
    VIEW.HEIGHT / 2,
    VIEW.WIDTH * 0.63
  );
  vignette.addColorStop(0, 'rgba(4, 10, 18, 0)');
  vignette.addColorStop(1, 'rgba(4, 10, 18, 0.24)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW.WIDTH, VIEW.HEIGHT);
}

function render() {
  if (!game) return;

  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.clearRect(0, 0, VIEW.WIDTH, VIEW.HEIGHT);
  ctx.fillStyle = '#0a1622';
  ctx.fillRect(0, 0, VIEW.WIDTH, VIEW.HEIGHT);

  const floorMap = getFloorMap();
  const shakeStrength = game.shake * 8;
  const shakeX = shakeStrength > 0 ? (Math.random() - 0.5) * shakeStrength : 0;
  const shakeY = shakeStrength > 0 ? (Math.random() - 0.5) * shakeStrength : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.translate(-Math.round(game.cameraX), 0);

  drawFloor(floorMap);
  drawStairLabels(floorMap);
  drawRoomLabels(floorMap);
  drawTargetMarker(floorMap);
  drawPickups(floorMap);

  // Učitelé se vykreslují jen na aktuálním patře.
  for (const enemy of floorMap.enemies) {
    drawTeacher(enemy);
  }
  drawProjectiles(floorMap);
  drawPlayer();
  drawAimGuide();

  ctx.restore();
  drawEffects();
}

/* ------------------------- 8. HUD A OVERLAY STAV ----------------------- */

function buildFloorPills() {
  dom.floorPills.innerHTML = '';
  FLOOR_CONFIGS.forEach((config, index) => {
    const pill = document.createElement('span');
    pill.className = 'floor-pill';
    pill.textContent = String(index + 1);
    pill.title = config.label;
    pill.setAttribute('aria-label', config.label);
    dom.floorPills.appendChild(pill);
  });
}

function updateBackpack() {
  dom.backpackSlots.innerHTML = '';
  const descriptions = [];

  for (let index = 0; index < INVENTORY_LIMIT; index += 1) {
    const inventoryItem = game.inventory[index];
    const slot = document.createElement('span');

    if (inventoryItem) {
      const item = ITEM_TYPES[inventoryItem.type];
      slot.className = 'backpack-slot filled';
      slot.innerHTML = item.svg;
      slot.title = item.label;
      slot.setAttribute('aria-label', item.label);
      descriptions.push(item.label);
    } else {
      slot.className = 'backpack-slot empty';
      slot.setAttribute('aria-label', 'Prázdný slot');
    }

    dom.backpackSlots.appendChild(slot);
  }

  dom.backpack.setAttribute(
    'aria-label',
    descriptions.length > 0
      ? `Batoh: ${descriptions.join(', ')}`
      : 'Prázdný batoh'
  );
}

function updateHud() {
  const activeTask = game.task;
  dom.taskName.textContent = activeTask ? activeTask.name : '—';
  dom.taskFloor.textContent =
    game.mode === 'start'
      ? 'Připraven ke startu'
      : game.mode === 'gameover'
        ? 'Konec hry'
        : activeTask
          ? 'Učebna'
          : 'Hledám další úkol…';

  dom.statDone.textContent = String(game.completed);
  dom.statScore.textContent = String(game.score);
  dom.statTime.textContent = formatTime(game.elapsed);
  game.lastClockText = formatTime(game.elapsed);

  const pills = dom.floorPills.children;
  for (let index = 0; index < pills.length; index += 1) {
    pills[index].classList.toggle('active', index === game.floorIndex);
  }

  dom.lives.innerHTML = '';
  dom.lives.setAttribute('aria-label', `${game.lives} ${lifeNoun(game.lives)}`);
  for (let index = 0; index < MAX_LIVES; index += 1) {
    const life = document.createElement('span');
    life.className = `life${index >= game.lives ? ' lost' : ''}`;
    dom.lives.appendChild(life);
  }

  updateBackpack();
}

function bumpTaskName() {
  dom.taskName.classList.remove('bump');
  // Vynucení reflow, aby se stejná animace spustila i opakovaně.
  void dom.taskName.offsetWidth;
  dom.taskName.classList.add('bump');
}

function showToast(message, tone = 'info', duration = 1800) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.className = `toast show ${tone}`;

  toastTimer = window.setTimeout(() => {
    dom.toast.className = 'toast';
  }, duration);
}

/* ------------------------------ 9. VSTUP ------------------------------- */

const MOVEMENT_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
]);

function updatePointerPosition(event) {
  const rect = dom.canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  pointer.x = ((event.clientX - rect.left) / rect.width) * VIEW.WIDTH;
  pointer.y = ((event.clientY - rect.top) / rect.height) * VIEW.HEIGHT;
  pointer.active =
    pointer.x >= 0 &&
    pointer.x <= VIEW.WIDTH &&
    pointer.y >= 0 &&
    pointer.y <= VIEW.HEIGHT;
}

dom.canvas.addEventListener('pointermove', updatePointerPosition);
dom.canvas.addEventListener('pointerdown', updatePointerPosition);
dom.canvas.addEventListener('pointerleave', () => {
  pointer.active = false;
});

window.addEventListener('keydown', (event) => {
  if (MOVEMENT_KEYS.has(event.code)) {
    event.preventDefault();
    keys.add(event.code);
    return;
  }

  if (event.repeat) return;

  if (event.code === 'KeyE') {
    event.preventDefault();
    throwItem();
    return;
  }

  if (event.code === 'KeyP' || event.code === 'Escape') {
    event.preventDefault();
    togglePause();
    return;
  }

  if (event.code === 'Enter' || event.code === 'Space') {
    if (game.mode === 'start') {
      event.preventDefault();
      startNewGame();
    } else if (game.mode === 'paused') {
      event.preventDefault();
      resumeGame();
    } else if (game.mode === 'gameover') {
      event.preventDefault();
      startNewGame();
    }
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

window.addEventListener('blur', () => {
  keys.clear();
  if (game && game.mode === 'playing') pauseGame();
});

dom.startButton.addEventListener('click', () => {
  if (game.mode === 'start') startNewGame();
});

dom.resumeButton.addEventListener('click', () => {
  if (game.mode === 'paused') resumeGame();
});

dom.restartButton.addEventListener('click', () => {
  if (game.mode === 'gameover') startNewGame();
});

/* --------------------------- 10. HERNÍ SMYČKA -------------------------- */

let lastFrameTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  if (game.mode === 'playing') {
    updateGame(dt);
  } else {
    // I v pauze / na startu necháme doznít vizuální efekty.
    game.shake = Math.max(0, game.shake - dt * 1.8);
    game.damageFlash = Math.max(0, game.damageFlash - dt * 2.2);
    game.floorFlash = Math.max(0, game.floorFlash - dt * 2.6);
  }

  render();
  requestAnimationFrame(frame);
}

/* ---------------------------- 11. START APLIKACE ----------------------- */

function init() {
  buildFloorPills();
  setupCanvas();
  game = createGameState();
  updateHud();
  setCameraImmediately();

  // Přístupný stav a krokování pro ladění v konzoli prohlížeče.
  window.cichnaGame = {
    get state() {
      return game;
    },
    get floors() {
      return FLOOR_CONFIGS;
    },
    tick(seconds = 1 / 60) {
      let remaining = Math.max(0, seconds);
      while (remaining > 0) {
        const step = Math.min(remaining, 1 / 60);
        if (game.mode === 'playing') updateGame(step);
        remaining -= step;
      }
      render();
    },
  };

  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  setupCanvas();
});

init();
