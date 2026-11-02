/** Weapon, gear, and economy catalogue. Damage numbers follow CS-style hitgroups. */

export const HIT = { head: 4, chest: 1, stomach: 1.25, legs: 0.75 }

const rifle = (extra) => ({
  slot: 'primary',
  auto: true,
  mag: 30,
  reserve: 90,
  reload: 2.45,
  fire: 0.1,
  move: 0.86,
  damage: 32,
  armorRatio: 0.72,
  helmetScale: 0.7,
  ignoreHelmet: false,
  rangeMod: 0.98,
  baseSpread: 0.0016,
  moveSpread: 0.018,
  airSpread: 0.07,
  crouchMul: 0.55,
  aimMul: 0.72,
  pellets: 1,
  tag: 0.52,
  noise: 32,
  recoil: [
    [0.0, 0.034],
    [0.004, 0.038],
    [-0.006, 0.04],
    [-0.012, 0.036],
    [-0.008, 0.032],
    [0.006, 0.03],
    [0.014, 0.028],
    [0.01, 0.026],
    [0.0, 0.024],
    [-0.012, 0.022],
    [-0.016, 0.02],
    [-0.006, 0.02]
  ],
  ...extra
})

export const WEAPONS = {
  knife: {
    id: 'knife',
    name: 'Knife',
    slot: 'melee',
    auto: false,
    mag: 1,
    reserve: 0,
    reload: 0,
    fire: 0.42,
    move: 1,
    damage: 40,
    back: 90,
    reach: 2.15,
    armorRatio: 0.85,
    helmetScale: 1,
    ignoreHelmet: false,
    rangeMod: 1,
    baseSpread: 0,
    moveSpread: 0,
    airSpread: 0,
    crouchMul: 1,
    aimMul: 1,
    pellets: 1,
    tag: 0.9,
    noise: 4,
    price: 0,
    team: null,
    recoil: [[0, 0]]
  },
  glock: {
    id: 'glock',
    name: 'Glock-18',
    slot: 'secondary',
    auto: false,
    burst: true,
    mag: 20,
    reserve: 120,
    reload: 2.2,
    fire: 0.15,
    move: 0.96,
    damage: 30,
    armorRatio: 0.47,
    helmetScale: 0.5,
    ignoreHelmet: false,
    rangeMod: 0.85,
    baseSpread: 0.006,
    moveSpread: 0.02,
    airSpread: 0.06,
    crouchMul: 0.7,
    aimMul: 0.85,
    pellets: 1,
    tag: 0.8,
    noise: 18,
    price: 0,
    team: 'T',
    recoil: [[0, 0.02], [0.01, 0.022], [-0.012, 0.02]]
  },
  usp: {
    id: 'usp',
    name: 'USP-S',
    slot: 'secondary',
    auto: false,
    mag: 12,
    reserve: 24,
    reload: 2.2,
    fire: 0.17,
    move: 0.96,
    damage: 35,
    armorRatio: 0.5,
    helmetScale: 0.5,
    ignoreHelmet: false,
    rangeMod: 0.86,
    baseSpread: 0.004,
    moveSpread: 0.016,
    airSpread: 0.05,
    crouchMul: 0.65,
    aimMul: 0.8,
    pellets: 1,
    tag: 0.78,
    noise: 12,
    price: 0,
    team: 'CT',
    recoil: [[0, 0.022], [0.008, 0.02]]
  },
  p250: {
    id: 'p250',
    name: 'P250',
    slot: 'secondary',
    auto: false,
    mag: 13,
    reserve: 26,
    reload: 2.2,
    fire: 0.15,
    move: 0.96,
    damage: 38,
    armorRatio: 0.64,
    helmetScale: 0.55,
    ignoreHelmet: false,
    rangeMod: 0.9,
    baseSpread: 0.005,
    moveSpread: 0.018,
    airSpread: 0.055,
    crouchMul: 0.7,
    aimMul: 0.85,
    pellets: 1,
    tag: 0.75,
    noise: 20,
    price: 300,
    team: null,
    recoil: [[0, 0.028], [0.01, 0.026]]
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle',
    slot: 'secondary',
    auto: false,
    mag: 7,
    reserve: 35,
    reload: 2.2,
    fire: 0.45,
    move: 0.92,
    damage: 53,
    armorRatio: 0.93,
    helmetScale: 0.85,
    ignoreHelmet: false,
    rangeMod: 0.95,
    baseSpread: 0.004,
    moveSpread: 0.03,
    airSpread: 0.09,
    crouchMul: 0.6,
    aimMul: 0.75,
    pellets: 1,
    tag: 0.55,
    noise: 28,
    price: 700,
    team: null,
    recoil: [[0.0, 0.07], [-0.02, 0.06]]
  },
  mac10: rifle({
    id: 'mac10',
    name: 'MAC-10',
    team: 'T',
    price: 1050,
    mag: 30,
    reserve: 100,
    fire: 0.075,
    reload: 2.6,
    move: 0.96,
    damage: 29,
    armorRatio: 0.575,
    helmetScale: 0.45,
    rangeMod: 0.8,
    baseSpread: 0.012,
    moveSpread: 0.012,
    airSpread: 0.08,
    noise: 22,
    tag: 0.72
  }),
  mp9: rifle({
    id: 'mp9',
    name: 'MP9',
    team: 'CT',
    price: 1250,
    mag: 30,
    reserve: 120,
    fire: 0.07,
    reload: 2.1,
    move: 0.96,
    damage: 26,
    armorRatio: 0.6,
    helmetScale: 0.45,
    rangeMod: 0.84,
    baseSpread: 0.01,
    moveSpread: 0.01,
    noise: 20,
    tag: 0.74
  }),
  nova: {
    id: 'nova',
    name: 'Nova',
    slot: 'primary',
    auto: false,
    mag: 8,
    reserve: 32,
    reload: 3.2,
    fire: 0.88,
    move: 0.88,
    damage: 18,
    armorRatio: 0.5,
    helmetScale: 0.5,
    ignoreHelmet: false,
    rangeMod: 0.7,
    baseSpread: 0.02,
    moveSpread: 0.02,
    airSpread: 0.08,
    crouchMul: 0.7,
    aimMul: 0.85,
    pellets: 8,
    pelletSpread: 0.09,
    tag: 0.5,
    noise: 26,
    price: 1050,
    team: null,
    recoil: [[0, 0.05]]
  },
  galil: rifle({
    id: 'galil',
    name: 'Galil AR',
    team: 'T',
    price: 1800,
    mag: 35,
    reserve: 90,
    fire: 0.09,
    damage: 30,
    armorRatio: 0.7,
    helmetScale: 0.7,
    move: 0.88
  }),
  famas: rifle({
    id: 'famas',
    name: 'FAMAS',
    team: 'CT',
    price: 2050,
    mag: 25,
    reserve: 90,
    fire: 0.09,
    damage: 30,
    armorRatio: 0.7,
    helmetScale: 0.7,
    move: 0.88
  }),
  ak47: rifle({
    id: 'ak47',
    name: 'AK-47',
    team: 'T',
    price: 2700,
    damage: 36,
    armorRatio: 0.77,
    helmetScale: 1,
    ignoreHelmet: true,
    move: 0.86,
    fire: 0.1,
    noise: 34
  }),
  m4a1: rifle({
    id: 'm4a1',
    name: 'M4A1',
    team: 'CT',
    price: 3100,
    damage: 33,
    armorRatio: 0.7,
    helmetScale: 0.7,
    ignoreHelmet: false,
    move: 0.9,
    fire: 0.09,
    noise: 30
  }),
  awp: {
    id: 'awp',
    name: 'AWP',
    slot: 'primary',
    auto: false,
    scope: true,
    mag: 5,
    reserve: 30,
    reload: 3.6,
    fire: 1.45,
    move: 0.72,
    damage: 115,
    armorRatio: 0.975,
    helmetScale: 1,
    ignoreHelmet: true,
    rangeMod: 0.99,
    baseSpread: 0.05,
    scopedSpread: 0.0006,
    moveSpread: 0.04,
    airSpread: 0.12,
    crouchMul: 0.5,
    aimMul: 1,
    pellets: 1,
    tag: 0.35,
    noise: 48,
    price: 4750,
    team: null,
    recoil: [[0, 0.09]]
  }
}

export const GEAR = {
  vest: { id: 'vest', name: 'Kevlar', price: 650, team: null },
  vesthelm: { id: 'vesthelm', name: 'Kevlar + Helmet', price: 1000, team: null },
  kit: { id: 'kit', name: 'Defuse Kit', price: 400, team: 'CT' },
  he: { id: 'he', name: 'HE Grenade', price: 300, team: null, nade: true, max: 1 },
  flash: { id: 'flash', name: 'Flashbang', price: 200, team: null, nade: true, max: 2 },
  smoke: { id: 'smoke', name: 'Smoke', price: 300, team: null, nade: true, max: 1 },
  molotov: { id: 'molotov', name: 'Molotov', price: 400, team: null, nade: true, max: 1 },
  ammo: { id: 'ammo', name: 'Ammo Refill', price: 250, team: null }
}

export const NADES = new Set(['he', 'flash', 'smoke', 'molotov'])

/** @param {string} id */
export function getWeapon(id) {
  return WEAPONS[id] || null
}

/** @param {'T'|'CT'} team */
export function defaultPistol(team) {
  return team === 'CT' ? 'usp' : 'glock'
}

/** @param {string} id */
export function itemDef(id) {
  if (WEAPONS[id]) return { ...WEAPONS[id], kind: 'weapon' }
  if (GEAR[id]) return { ...GEAR[id], kind: 'gear' }
  return null
}

/**
 * Fresh magazine state for a purchased or spawned weapon.
 * @param {string} id
 */
export function fullClip(id) {
  const w = WEAPONS[id]
  return { id, mag: w.mag, reserve: w.reserve }
}

/**
 * @param {object} player
 */
export function activeEntry(player) {
  if (player.slot === 'primary') return player.loadout.primary
  if (player.slot === 'secondary') return player.loadout.secondary
  if (player.slot === 'melee') return player.loadout.knife
  if (player.slot === 'grenade') {
    const id = player.loadout.grenades[player.nadeIndex] || null
    return id ? { id, mag: 1, reserve: 0 } : null
  }
  if (player.slot === 'bomb') return player.loadout.bomb ? { id: 'c4', mag: 1, reserve: 0 } : null
  return null
}

/** @param {object} player */
export function activeWeapon(player) {
  const e = activeEntry(player)
  if (!e) return getWeapon('knife')
  if (NADES.has(e.id)) {
    const gear = GEAR[e.id]
    return {
      id: e.id,
      name: gear?.name || e.id,
      slot: 'grenade',
      auto: false,
      mag: 1,
      reserve: 0,
      reload: 0,
      fire: 0.55,
      move: 1,
      damage: 0,
      recoil: [[0, 0]],
      baseSpread: 0,
      moveSpread: 0,
      airSpread: 0,
      crouchMul: 1,
      aimMul: 1,
      pellets: 1,
      noise: 6,
      tag: 1,
      nade: true
    }
  }
  return getWeapon(e.id) || getWeapon('knife')
}
