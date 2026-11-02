import {
  BOMB_TIME,
  BUY_TIME,
  DEFUSE_KIT_TIME,
  DEFUSE_TIME,
  END_TIME,
  FREEZE_TAIL,
  HALF_TIME,
  HISTORY,
  LIVE_TIME,
  PLANT_TIME,
  RADIUS,
  STAND_H,
  START_MONEY,
  clamp,
  dirFromAngles,
  dist2,
  dist3,
  lerpAngle
} from './constants.js'

import { MAP, inBuyZone, siteAt } from './map.js'
import { NADES, activeEntry, activeWeapon, defaultPistol, fullClip, getWeapon } from './weapons.js'
import { clampMoney, killReward, lossBonus, purchase, refillAmmo } from './economy.js'
import { computeSpread, deflect } from './combat.js'
import { applyBulletDamage, eyeOf, headOf, posesAt, rayPlayers } from '../physics/hitreg.js'
import { depenetrate } from '../physics/collisions.js'
import { applyLocomotion } from '../physics/movement.js'
import { createPhysics, attachRapier } from '../physics/world.js'
import { buildNav } from './nav.js'
import { botNames } from './bots.js'
import { carveSmoke, stepGrenades, stepHazards, throwGrenade } from './grenades.js'

const IDLE = {
  forward: 0,
  side: 0,
  fire: false,
  jump: false,
  crouch: false,
  walk: false,
  use: false,
  reload: false,
  aim: false,
  drop: false
}

/** @param {object} [human] */
export function defaultRoster(human = null) {
  const names = botNames()
  const roster = []
  for (const team of ['CT', 'T']) {
    for (let i = 0; i < 5; i++) {
      const isHuman = human && human.team === team && i === 0
      roster.push({
        id: isHuman ? 'local' : `${team}${i}`,
        name: isHuman ? human.name || 'Operator' : names[team][i],
        team,
        bot: !isHuman
      })
    }
  }
  return roster
}

/** @param {object} spec */
export function makePlayer(spec) {
  const pistol = defaultPistol(spec.team)
  return {
    id: spec.id,
    name: spec.name,
    team: spec.team,
    bot: !!spec.bot,
    frozen: !!spec.frozen,
    alive: true,
    survived: true,
    pos: { x: 0, y: 0.2, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    lookYaw: spec.team === 'CT' ? 0 : Math.PI,
    lookPitch: 0,
    punchYaw: 0,
    punchPitch: 0,
    height: STAND_H,
    grounded: true,
    health: 100,
    armor: 0,
    helmet: false,
    money: START_MONEY,
    loadout: {
      primary: null,
      secondary: fullClip(pistol),
      knife: fullClip('knife'),
      grenades: [],
      bomb: false
    },
    slot: 'secondary',
    prevSlot: 'melee',
    nadeIndex: 0,
    kit: false,
    flash: 0,
    scoped: 0,
    aiming: false,
    reloadT: 0,
    nextFire: 0,
    lastShot: -10,
    recoilIdx: 0,
    planting: 0,
    defusing: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    damageDealt: 0,
    attackers: {},
    role: 'hold',
    goalSite: 'A',
    hurt: 0,
    hurtDir: { x: 0, z: 1 },
    fireHeld: false,
    aimLatch: false,
    reloadLatch: false,
    dropLatch: false,
    jumpBuffer: 0,
    order: null,
    moneyPop: null,
    ping: 0,
    _perfect: false,
    didBuyRound: 0
  }
}

function blankBomb() {
  return {
    state: 'idle',
    carrier: null,
    pos: { x: 0, y: 0.2, z: 0 },
    timer: BOMB_TIME,
    site: null,
    planter: null,
    defuser: null,
    defuse: 0
  }
}

/**
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function createMatch(opts = {}) {
  const onStatus = opts.onStatus || (() => {})
  onStatus('Building the sector')
  const physics = createPhysics(MAP.solids)
  if (opts.withRapier !== false) {
    onStatus('Starting physics')
    await attachRapier(physics)
  }
  onStatus('Baking navigation')
  const nav = opts.nav || buildNav(MAP.solids)
  const roster = opts.roster || defaultRoster(opts.human || null)
  const state = {
    time: 0,
    tick: 0,
    phase: 'buy',
    phaseTime: BUY_TIME,
    buyDuration: BUY_TIME,
    round: 1,
    roundsPlayed: 0,
    halfRounds: opts.halfRounds ?? 4,
    winsNeeded: opts.winsNeeded ?? 5,
    overtime: false,
    didHalf: false,
    forcePistol: false,
    pistolRound: true,
    difficulty: opts.difficulty || 'normal',
    friendlyFire: !!opts.friendlyFire,
    score: { T: 0, CT: 0 },
    lossStreak: { T: 0, CT: 0 },
    rounds: [],
    players: roster.map((r) => makePlayer(r)),
    bomb: blankBomb(),
    grenades: [],
    smokes: [],
    fires: [],
    pickups: [],
    events: [],
    killfeed: [],
    banner: null,
    history: new Array(HISTORY).fill(null),
    winner: null
  }
  const match = { state, physics, nav, ids: 1, ai: opts.withAI !== false, suppressWin: false, hurt: null }
  match.hurt = (victim, amount, attacker, weaponId, group, headshot) =>
    hurt(match, victim, amount, attacker, weaponId, group, headshot)
  beginRound(match, true)
  onStatus('Ready')
  return match
}

function teamMembers(state, team) {
  return state.players.filter((p) => p.team === team)
}

function placeAll(match) {
  for (const team of ['CT', 'T']) {
    teamMembers(match.state, team).forEach((p, i) => {
      const list = MAP.spawns[team]
      const s = list[i % list.length]
      p.pos = { x: s[0], y: s[1], z: s[2] }
      p.vel = { x: 0, y: 0, z: 0 }
      p.lookYaw = s[3]
      p.lookPitch = 0
      p.punchYaw = 0
      p.punchPitch = 0
      p.height = STAND_H
      p.grounded = true
      p.health = 100
      p.alive = true
      p.flash = 0
      p.scoped = 0
      p.reloadT = 0
      p.planting = 0
      p.defusing = 0
      p.attackers = {}
      p.recoilIdx = 0
      depenetrate(match.physics.solids, p.pos, p.height, RADIUS)
    })
  }
}

function stripToPistol(player) {
  player.loadout.primary = null
  player.loadout.secondary = fullClip(defaultPistol(player.team))
  player.loadout.grenades = []
  player.loadout.bomb = false
  player.slot = 'secondary'
  player.armor = 0
  player.helmet = false
  player.kit = false
  player.nadeIndex = 0
}

function assignRoles(state) {
  const ts = teamMembers(state, 'T')
  const cts = teamMembers(state, 'CT')
  const site = state.round % 2 === 0 ? 'B' : 'A'
  ts.forEach((p, i) => {
    p.role = i === 0 ? 'entry' : i === ts.length - 1 ? 'lurk' : 'support'
    p.goalSite = p.role === 'lurk' ? (site === 'A' ? 'B' : 'A') : site
  })
  const ctSites = ['A', 'A', 'B', 'B', 'MID']
  cts.forEach((p, i) => {
    p.role = 'hold'
    p.goalSite = ctSites[i % ctSites.length]
  })
}

function assignBomb(state) {
  for (const p of state.players) p.loadout.bomb = false
  const ts = state.players.filter((p) => p.team === 'T' && p.alive)
  state.bomb = blankBomb()
  if (!ts.length) return
  const carrier = ts[state.round % ts.length]
  carrier.loadout.bomb = true
  state.bomb.state = 'carried'
  state.bomb.carrier = carrier.id
  state.bomb.pos = { x: carrier.pos.x, y: carrier.pos.y + 0.4, z: carrier.pos.z }
}

/** @param {object} match @param {boolean} [opening] */
export function beginRound(match, opening = false) {
  const s = match.state
  if (!opening) {
    for (const p of s.players) {
      if (!p.survived) stripToPistol(p)
      if (s.forcePistol) {
        stripToPistol(p)
        p.money = START_MONEY
      }
    }
  }
  s.forcePistol = false
  s.pistolRound = s.round === 1 || s.afterHalf
  s.afterHalf = false
  s.phase = 'buy'
  s.phaseTime = BUY_TIME
  s.grenades = []
  s.smokes = []
  s.fires = []
  s.pickups = []
  for (const p of s.players) {
    refillAmmo(p)
    p.survived = true
  }
  placeAll(match)
  assignRoles(s)
  assignBomb(s)
  s.banner = { text: `ROUND ${s.round}`, sub: s.pistolRound ? 'PISTOL ROUND' : 'BUY', until: s.time + 2.4 }
  recordHistory(s)
}

function recordHistory(state) {
  state.history[state.tick % state.history.length] = state.players.map((p) => ({
    id: p.id,
    alive: p.alive,
    team: p.team,
    height: p.height,
    pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }
  }))
}

function banner(state, text, sub, dur = 3) {
  state.banner = { text, sub, until: state.time + dur }
}

function pushEvent(state, event) {
  state.events.push(event)
  if (state.events.length > 48) state.events.shift()
}

/** @param {object} match @param {string} winner @param {string} reason */
export function endRound(match, winner, reason) {
  const s = match.state
  if (s.phase === 'end' || s.phase === 'gameover' || s.phase === 'halftime') return
  s.score[winner] += 1
  s.rounds.push({ winner, reason, round: s.round })
  const loser = winner === 'T' ? 'CT' : 'T'
  s.lossStreak[winner] = 0
  s.lossStreak[loser] = Math.min(5, s.lossStreak[loser] + 1)
  const winMoney = reason === 'bomb' || reason === 'defuse' ? 3500 : 3250
  const loseMoney = lossBonus(s.lossStreak[loser])
  for (const p of s.players) {
    p.survived = p.alive
    const gain = p.team === winner ? winMoney : loseMoney
    if (reason === 'defuse' && p.id === s.bomb.defuser) {
      p.money = clampMoney(p.money + gain + 300)
      p.moneyPop = { amount: gain + 300, until: s.time + 1.6 }
    } else {
      p.money = clampMoney(p.money + gain)
      p.moneyPop = { amount: gain, until: s.time + 1.6 }
    }
  }
  const reasonText = {
    elimination: 'ELIMINATION',
    bomb: 'BOMB DETONATED',
    defuse: 'BOMB DEFUSED',
    time: 'TIME EXPIRED'
  }[reason] || reason
  const matchWinner = matchWinnerOf(s)
  if (matchWinner) {
    s.phase = 'gameover'
    s.winner = matchWinner
    s.phaseTime = 99
    banner(s, `${matchWinner === 'T' ? 'TERRORISTS' : 'COUNTER-TERRORISTS'} WIN`, 'MATCH OVER', 30)
  } else {
    s.phase = 'end'
    s.phaseTime = END_TIME
    banner(s, `${winner === 'T' ? 'TERRORISTS' : 'COUNTER-TERRORISTS'} WIN`, reasonText, END_TIME)
  }
  pushEvent(s, { type: 'round', winner, reason })
}

function matchWinnerOf(state) {
  const a = state.score.T
  const b = state.score.CT
  const n = state.winsNeeded
  if (state.winsNeeded >= 13 && a >= n - 1 && b >= n - 1) state.overtime = true
  if (state.overtime) {
    if (Math.abs(a - b) >= 2 && Math.max(a, b) >= n) return a > b ? 'T' : 'CT'
    return null
  }
  if (a >= n) return 'T'
  if (b >= n) return 'CT'
  return null
}

function checkElimination(match) {
  const s = match.state
  if (s.phase !== 'live' || match.suppressWin) return
  const tAlive = s.players.some((p) => p.team === 'T' && p.alive)
  const ctAlive = s.players.some((p) => p.team === 'CT' && p.alive)
  if (!ctAlive) endRound(match, 'T', 'elimination')
  else if (!tAlive && s.bomb.state !== 'planted') endRound(match, 'CT', 'elimination')
}

function dropEntry(match, player, entry) {
  if (!entry) return
  match.state.pickups.push({
    id: `k${match.ids++}`,
    weapon: entry.id,
    mag: entry.mag,
    reserve: entry.reserve,
    pos: { x: player.pos.x, y: player.pos.y + 0.25, z: player.pos.z },
    vel: { x: Math.sin(player.lookYaw) * 2, y: 1, z: Math.cos(player.lookYaw) * 2 }
  })
}

/** @param {object} match @param {object} player */
export function dropHeld(match, player) {
  if (!player.alive) return
  if (player.slot === 'bomb' && player.loadout.bomb) {
    player.loadout.bomb = false
    match.state.bomb.state = 'dropped'
    match.state.bomb.carrier = null
    match.state.bomb.pos = { x: player.pos.x, y: 0.2, z: player.pos.z }
    setSlot(player, 'secondary')
    return
  }
  if (player.slot === 'primary' && player.loadout.primary) {
    dropEntry(match, player, player.loadout.primary)
    player.loadout.primary = null
    setSlot(player, player.loadout.secondary ? 'secondary' : 'melee')
    return
  }
  if (player.slot === 'secondary' && player.loadout.secondary) {
    const pistol = player.loadout.secondary
    if (pistol.id === defaultPistol(player.team) && pistol.mag === getWeapon(pistol.id).mag) return
    dropEntry(match, player, pistol)
    player.loadout.secondary = fullClip(defaultPistol(player.team))
    return
  }
  if (player.slot === 'grenade' && player.loadout.grenades.length) {
    const kind = player.loadout.grenades.splice(player.nadeIndex, 1)[0]
    if (player.nadeIndex >= player.loadout.grenades.length) player.nadeIndex = 0
    match.state.pickups.push({
      id: `k${match.ids++}`,
      weapon: kind,
      mag: 1,
      reserve: 0,
      nade: true,
      pos: { x: player.pos.x, y: 0.3, z: player.pos.z },
      vel: { x: 0, y: 1, z: 0 }
    })
  }
}

function downPlayer(match, victim, attacker, weaponId, headshot) {
  const s = match.state
  if (!victim.alive) return
  victim.alive = false
  victim.health = 0
  victim.deaths += 1
  victim.planting = 0
  victim.defusing = 0
  victim.scoped = 0
  if (s.bomb.carrier === victim.id && s.bomb.state === 'carried') {
    victim.loadout.bomb = false
    s.bomb.state = 'dropped'
    s.bomb.carrier = null
    s.bomb.pos = { x: victim.pos.x, y: 0.2, z: victim.pos.z }
  }
  if (victim.loadout.primary) {
    dropEntry(match, victim, victim.loadout.primary)
    victim.loadout.primary = null
  }
  let assist = null
  let assistDmg = 20
  for (const [id, dmg] of Object.entries(victim.attackers)) {
    if (attacker && id === attacker.id) continue
    if (dmg >= assistDmg) {
      assistDmg = dmg
      assist = s.players.find((p) => p.id === id) || null
    }
  }
  if (assist) assist.assists += 1
  if (attacker && attacker !== victim && attacker.team !== victim.team) {
    attacker.kills += 1
    const reward = weaponId === 'c4' ? 0 : killReward(weaponId)
    attacker.money = clampMoney(attacker.money + reward)
    if (reward) attacker.moneyPop = { amount: reward, until: s.time + 1.2 }
  }
  s.killfeed.push({
    t: s.time,
    killer: attacker ? attacker.name : 'Bomb',
    killerTeam: attacker ? attacker.team : 'T',
    victim: victim.name,
    victimTeam: victim.team,
    weapon: weaponId,
    headshot: !!headshot
  })
  s.killfeed = s.killfeed.filter((k) => s.time - k.t < 5.2).slice(-6)
  pushEvent(s, {
    type: 'kill',
    killerId: attacker?.id || null,
    victimId: victim.id,
    weapon: weaponId,
    headshot: !!headshot
  })
  checkElimination(match)
}

function hurt(match, victim, amount, attacker, weaponId, group, headshot) {
  const s = match.state
  if (!victim.alive || s.phase !== 'live') return 0
  if (attacker && attacker !== victim && attacker.team === victim.team && !s.friendlyFire && weaponId !== 'he' && weaponId !== 'molotov') {
    return 0
  }
  const dmg = Math.max(0, amount)
  if (dmg <= 0) return 0
  victim.health -= dmg
  victim.hurt = Math.min(1, 0.25 + dmg / 80)
  if (attacker) {
    const dx = attacker.pos.x - victim.pos.x
    const dz = attacker.pos.z - victim.pos.z
    victim.hurtDir = { x: dx, z: dz }
    victim.vel.x *= getWeapon(weaponId)?.tag ?? 0.7
    victim.vel.z *= getWeapon(weaponId)?.tag ?? 0.7
    if (attacker !== victim) {
      victim.attackers[attacker.id] = (victim.attackers[attacker.id] || 0) + dmg
      attacker.damageDealt += dmg
    }
  }
  pushEvent(s, {
    type: 'hit',
    attackerId: attacker?.id || null,
    victimId: victim.id,
    damage: dmg,
    group,
    headshot: !!headshot,
    weapon: weaponId
  })
  if (victim.health <= 0) downPlayer(match, victim, attacker, weaponId, headshot)
  return dmg
}

const SLOT_CYCLE = ['primary', 'secondary', 'melee', 'grenade', 'bomb']

/** @param {object} player @param {string} slot */
export function setSlot(player, slot) {
  if (slot === 'last') return setSlot(player, player.prevSlot || 'secondary')
  if (slot === 'next' || slot === 'prev') {
    const available = SLOT_CYCLE.filter((id) => {
      if (id === 'primary') return !!player.loadout.primary
      if (id === 'secondary') return !!player.loadout.secondary
      if (id === 'bomb') return !!player.loadout.bomb
      if (id === 'grenade') return player.loadout.grenades.length > 0
      return true
    })
    if (!available.length) return false
    const at = Math.max(0, available.indexOf(player.slot))
    const next = slot === 'next' ? available[(at + 1) % available.length] : available[(at - 1 + available.length) % available.length]
    return setSlot(player, next)
  }
  if (slot === 'grenade') {
    if (!player.loadout.grenades.length) return false
    if (player.slot === 'grenade') player.nadeIndex = (player.nadeIndex + 1) % player.loadout.grenades.length
    else {
      player.prevSlot = player.slot
      player.slot = 'grenade'
    }
    player.reloadT = 0
    player.scoped = 0
    return true
  }
  if (slot === 'primary' && !player.loadout.primary) return false
  if (slot === 'secondary' && !player.loadout.secondary) return false
  if (slot === 'bomb' && !player.loadout.bomb) return false
  if (!['primary', 'secondary', 'melee', 'bomb'].includes(slot)) return false
  if (player.slot !== slot) player.prevSlot = player.slot
  player.slot = slot
  player.reloadT = 0
  player.scoped = 0
  return true
}

function beginReload(player) {
  const entry = activeEntry(player)
  if (!entry) return
  const weapon = getWeapon(entry.id)
  if (!weapon || weapon.slot === 'melee' || NADES.has(entry.id)) return
  if (entry.mag >= weapon.mag || entry.reserve <= 0 || player.reloadT > 0) return
  player.reloadT = weapon.reload
  player.scoped = 0
}

function finishReload(player) {
  const entry = activeEntry(player)
  if (!entry) return
  const weapon = getWeapon(entry.id)
  if (!weapon) return
  const need = weapon.mag - entry.mag
  const take = Math.min(need, entry.reserve)
  entry.mag += take
  entry.reserve -= take
}

function otherSolids(state, self) {
  const extra = []
  for (const p of state.players) {
    if (p === self || !p.alive) continue
    const r = RADIUS * 0.9
    extra.push({
      min: [p.pos.x - r, p.pos.y, p.pos.z - r],
      max: [p.pos.x + r, p.pos.y + p.height, p.pos.z + r],
      mat: 'pawn'
    })
  }
  return extra
}

function anglesFor(input, u, player) {
  const samples = input.sub?.yaws
  if (!samples || !samples.length) {
    return {
      yaw: input.yaw !== undefined ? input.yaw : player.lookYaw,
      pitch: input.pitch !== undefined ? input.pitch : player.lookPitch
    }
  }
  let prev = samples[0]
  let next = samples[samples.length - 1]
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].u <= u) prev = samples[i]
    if (samples[i].u >= u) {
      next = samples[i]
      break
    }
  }
  const span = next.u - prev.u
  const f = span <= 1e-5 ? 1 : (u - prev.u) / span
  return { yaw: lerpAngle(prev.yaw, next.yaw, f), pitch: prev.pitch + (next.pitch - prev.pitch) * f }
}

function buttonsAt(input, u) {
  const keys = input.sub?.keys
  if (!keys || !keys.length) return input
  let cur = keys[0]
  for (const k of keys) if (k.u <= u + 1e-4) cur = k
  return { ...input, ...cur }
}

/**
 * Authoritative shot. `rewindTick` replays pawn poses for lag compensation.
 * `perfect` removes spread (tests and point-blank scripts).
 * @param {object} match
 * @param {string} playerId
 * @param {object} [opts]
 */
export function fireShot(match, playerId, opts = {}) {
  const s = match.state
  const player = s.players.find((p) => p.id === playerId)
  if (!player || !player.alive) return null
  if (s.phase !== 'live') return null
  if (player.reloadT > 0) return null
  if (s.time < player.nextFire && !opts.ignoreCooldown) return null
  const weapon = activeWeapon(player)
  if (NADES.has(weapon.id)) {
    throwGrenade(match, player, weapon.id, opts.short ? 'short' : 'far')
    player.nextFire = s.time + 0.45
    return { type: 'throw' }
  }
  const entry = activeEntry(player)
  if (weapon.id !== 'knife') {
    if (!entry || entry.mag <= 0) {
      beginReload(player)
      pushEvent(s, { type: 'dry', id: player.id })
      return { type: 'dry' }
    }
    entry.mag -= 1
  }
  player._perfect = !!opts.perfect
  const yaw = opts.yaw ?? player.lookYaw + player.punchYaw
  const pitch = opts.pitch ?? player.lookPitch + player.punchPitch
  let origin
  let pawns
  if (typeof opts.rewindTick === 'number') {
    const poses = posesAt(s, opts.rewindTick) || s.players
    const me = poses.find((p) => p.id === player.id)
    origin = me ? eyeOf(me) : eyeOf(player)
    pawns = poses
  } else {
    origin = eyeOf(player)
    pawns = s.players
  }
  const baseDir = dirFromAngles(yaw, pitch)
  const pellets = weapon.pellets || 1
  const rnd = opts.rnd || Math.random
  let bestHit = null
  const spread = computeSpread(player, weapon)
  const pelletSpread = weapon.pelletSpread || 0
  for (let i = 0; i < pellets; i++) {
    const dir = deflect(baseDir, i === 0 ? spread : spread + pelletSpread, rnd)
    const wall = match.physics.raycast(origin, dir, 180)
    const pawn = weapon.id === 'knife'
      ? null
      : rayPlayers(pawns, origin, dir, wall ? wall.t : 180, player.id, s.friendlyFire, player.team)
    const end = pawn
      ? pawn.point
      : wall
        ? wall.point
        : { x: origin.x + dir.x * 80, y: origin.y + dir.y * 80, z: origin.z + dir.z * 80 }
    carveSmoke(s.smokes, origin, end, 0.58)
    if (pawn && (!bestHit || pawn.t < bestHit.t)) bestHit = { ...pawn, dir, end }
    if (!pawn && wall && !bestHit) bestHit = { wall, dir, end, t: wall.t }
  }
  if (weapon.id === 'knife') {
    const dir = baseDir
    const wall = match.physics.raycast(origin, dir, weapon.reach || 2.2)
    let pawn = rayPlayers(pawns, origin, dir, wall ? Math.min(wall.t, weapon.reach) : weapon.reach, player.id, s.friendlyFire, player.team)
    if (!pawn) {
      let closest = 99
      for (const other of s.players) {
        if (!other.alive || other === player) continue
        if (!s.friendlyFire && other.team === player.team) continue
        const d = dist3(player.pos, other.pos)
        if (d > (weapon.reach || 2.2)) continue
        const to = { x: other.pos.x - player.pos.x, y: 0, z: other.pos.z - player.pos.z }
        const fl = Math.hypot(to.x, to.z) || 1
        const dot = (Math.sin(player.lookYaw) * to.x + Math.cos(player.lookYaw) * to.z) / fl
        if (dot > 0.4 && d < closest) {
          closest = d
          pawn = { id: other.id, t: d, group: 'chest', point: { ...other.pos, y: other.pos.y + 1 } }
        }
      }
    }
    if (pawn) {
      const victim = s.players.find((p) => p.id === pawn.id)
      const behind = victim && dirFromAngles(victim.lookYaw, 0)
      let back = false
      if (behind && victim) {
        const tx = player.pos.x - victim.pos.x
        const tz = player.pos.z - victim.pos.z
        const fl = Math.hypot(tx, tz) || 1
        back = behind.x * (tx / fl) + behind.z * (tz / fl) < -0.35
      }
      const dmg = back ? weapon.back || 90 : weapon.damage
      hurt(match, victim, dmg, player, 'knife', back ? 'back' : 'chest', false)
      bestHit = { ...pawn, knife: true, back }
    }
    player.nextFire = s.time + weapon.fire
    player.lastShot = s.time
    pushEvent(s, { type: 'shot', id: player.id, weapon: 'knife', origin, end: bestHit?.point || null })
    player._perfect = false
    return bestHit
  }

  if (bestHit && bestHit.id) {
    const victim = s.players.find((p) => p.id === bestHit.id)
    if (victim) {
      const dmg = applyBulletDamage(victim, weapon, bestHit.group, bestHit.t)
      hurt(match, victim, dmg, player, weapon.id, bestHit.group, bestHit.group === 'head')
    }
  }
  const pattern = weapon.recoil || [[0, 0]]
  const kick = pattern[Math.min(player.recoilIdx, pattern.length - 1)]
  player.punchYaw += kick[0]
  player.punchPitch += kick[1]
  player.recoilIdx += 1
  player.lastShot = s.time
  player.nextFire = s.time + weapon.fire
  if (weapon.scope) player.scoped = 0
  pushEvent(s, {
    type: 'shot',
    id: player.id,
    weapon: weapon.id,
    origin,
    end: bestHit?.end || bestHit?.point || null,
    hit: bestHit?.id || null,
    headshot: bestHit?.group === 'head',
    normal: bestHit?.wall?.normal || null
  })
  player._perfect = false
  return bestHit
}

function plantBomb(match, player) {
  const s = match.state
  const site = siteAt(player.pos)
  player.loadout.bomb = false
  player.planting = 0
  s.bomb.state = 'planted'
  s.bomb.carrier = null
  s.bomb.site = site
  s.bomb.pos = { x: player.pos.x, y: 0.2, z: player.pos.z }
  s.bomb.timer = BOMB_TIME
  s.bomb.planter = player.id
  player.money = clampMoney(player.money + 300)
  player.moneyPop = { amount: 300, until: s.time + 1.2 }
  if (player.slot === 'bomb') setSlot(player, 'secondary')
  banner(s, 'BOMB PLANTED', `SITE ${site}`, 2.2)
  pushEvent(s, { type: 'plant', id: player.id, site, pos: { ...s.bomb.pos } })
}

function explodeBomb(match) {
  const s = match.state
  const pos = s.bomb.pos
  s.bomb.state = 'exploded'
  match.suppressWin = true
  const planter = s.players.find((p) => p.id === s.bomb.planter) || null
  for (const p of s.players) {
    if (!p.alive) continue
    const d = dist3({ x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, pos)
    if (d > 22) continue
    const eye = eyeOf(p)
    const dir = { x: pos.x - eye.x, y: pos.y - eye.y, z: pos.z - eye.z }
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1
    dir.x /= len
    dir.y /= len
    dir.z /= len
    const wall = match.physics.raycast(eye, dir, d)
    const blocked = wall && wall.t < d - 0.4
    let dmg = 500 * (1 - d / 22)
    if (blocked) dmg *= 0.45
    if (p.armor > 0) dmg *= 0.85
    if (dmg > 2) hurt(match, p, dmg, planter, 'c4', 'chest', false)
  }
  match.suppressWin = false
  pushEvent(s, { type: 'explode', kind: 'bomb', pos: { ...pos } })
  if (s.phase === 'live') endRound(match, 'T', 'bomb')
}

function tryUse(match, player, dt, input) {
  const s = match.state
  if (!input.use || !player.alive || s.phase !== 'live') {
    player.planting = 0
    player.defusing = 0
    return
  }
  const speed = Math.hypot(player.vel.x, player.vel.z)
  if (player.team === 'T' && player.loadout.bomb && s.bomb.state === 'carried') {
    const site = siteAt(player.pos)
    if (site && player.grounded && speed < 1.1 && player.hurt <= 0.05) {
      player.planting += dt
      player.vel.x = 0
      player.vel.z = 0
      if (player.planting >= PLANT_TIME) plantBomb(match, player)
      return
    }
  }
  player.planting = 0
  if (player.team === 'CT' && s.bomb.state === 'planted' && dist2(player.pos, s.bomb.pos) < 1.7) {
    if (player.grounded && speed < 1.1 && player.hurt <= 0.05) {
      player.defusing += dt
      player.vel.x = 0
      player.vel.z = 0
      const need = player.kit ? DEFUSE_KIT_TIME : DEFUSE_TIME
      s.bomb.defuser = player.id
      s.bomb.defuse = player.defusing / need
      if (player.defusing >= need) {
        s.bomb.state = 'defused'
        player.defusing = 0
        pushEvent(s, { type: 'defuse', id: player.id })
        endRound(match, 'CT', 'defuse')
      }
      return
    }
  }
  player.defusing = 0
  if (s.bomb.defuser === player.id) s.bomb.defuse = 0
}

function touchWorld(match, player) {
  const s = match.state
  if (player.team === 'T' && s.bomb.state === 'dropped' && dist2(player.pos, s.bomb.pos) < 1.2) {
    s.bomb.state = 'carried'
    s.bomb.carrier = player.id
    player.loadout.bomb = true
    pushEvent(s, { type: 'pickup', id: player.id, weapon: 'c4' })
  }
  for (const item of s.pickups) {
    if (item.taken) continue
    if (dist2(player.pos, item.pos) > 1.35) continue
    if (item.nade) {
      if (player.loadout.grenades.length >= 4) continue
      player.loadout.grenades.push(item.weapon)
      item.taken = true
      continue
    }
    const w = getWeapon(item.weapon)
    if (!w) continue
    if (w.slot === 'primary' && !player.loadout.primary) {
      player.loadout.primary = { id: item.weapon, mag: item.mag, reserve: item.reserve }
      item.taken = true
    } else if (w.slot === 'secondary' && player.loadout.secondary?.id === defaultPistol(player.team)) {
      player.loadout.secondary = { id: item.weapon, mag: item.mag, reserve: item.reserve }
      item.taken = true
    }
  }
  s.pickups = s.pickups.filter((item) => !item.taken)
}

function advancePhase(match, dt) {
  const s = match.state
  if (s.phase === 'gameover') return
  s.phaseTime -= dt
  if (s.phase === 'buy' && s.phaseTime <= 0) {
    s.phase = 'live'
    s.phaseTime = LIVE_TIME
    banner(s, 'GO', `ROUND ${s.round}`, 1.2)
    pushEvent(s, { type: 'live' })
  } else if (s.phase === 'live' && s.bomb.state === 'planted') {
    s.bomb.timer -= dt
    if (s.bomb.timer <= 0) explodeBomb(match)
  } else if (s.phase === 'live' && s.phaseTime <= 0 && s.bomb.state !== 'planted') {
    endRound(match, 'CT', 'time')
  } else if (s.phase === 'end' && s.phaseTime <= 0) {
    s.roundsPlayed += 1
    if (!s.didHalf && s.roundsPlayed === s.halfRounds) {
      s.didHalf = true
      s.afterHalf = true
      s.forcePistol = true
      for (const p of s.players) p.team = p.team === 'T' ? 'CT' : 'T'
      s.lossStreak.T = 0
      s.lossStreak.CT = 0
      s.phase = 'halftime'
      s.phaseTime = HALF_TIME
      banner(s, 'HALFTIME', 'SIDES CHANGED', HALF_TIME)
      return
    }
    s.round += 1
    beginRound(match)
  } else if (s.phase === 'halftime' && s.phaseTime <= 0) {
    s.round += 1
    beginRound(match)
  }
}

/**
 * Fixed simulation step. Human inputs may include sub-tick `yaw` samples and fire times.
 * Bot orders are read from `player.order` when no explicit input is passed.
 * @param {object} match
 * @param {number} dt
 * @param {object} [inputs]
 */
export function stepMatch(match, dt, inputs = {}) {
  const s = match.state
  s.time += dt
  s.tick += 1
  s.events.length = 0
  advancePhase(match, dt)
  stepHazards(match, dt)
  stepGrenades(match, dt)

  const freeze = s.phase === 'buy' && s.phaseTime > s.buyDuration - FREEZE_TAIL
  const lockMove = freeze || s.phase === 'end' || s.phase === 'halftime' || s.phase === 'gameover'

  for (const player of s.players) {
    player.flash = Math.max(0, player.flash - dt * (0.18 + player.flash * 0.45))
    player.hurt = Math.max(0, player.hurt - dt)
    if (player.moneyPop && s.time > player.moneyPop.until) player.moneyPop = null
    if (!player.alive) continue
    const given = inputs[player.id]
    const input = given || (player.bot && !player.frozen ? player.order : null) || { ...IDLE, yaw: player.lookYaw, pitch: player.lookPitch }
    if (player.bot && player.order?.jump) player.order.jump = false

    if (input.slot) setSlot(player, input.slot)
    if (input.drop && !player.dropLatch) dropHeld(match, player)
    player.dropLatch = !!input.drop

    const subs = 4
    for (let sub = 0; sub < subs; sub++) {
      const u0 = sub / subs
      const u1 = (sub + 1) / subs
      const slice = buttonsAt(input, u1)
      const ang = anglesFor(input, u1, player)
      if (given || player.bot) {
        player.lookYaw = ang.yaw
        player.lookPitch = clamp(ang.pitch, -1.45, 1.45)
      }
      const moveInput = {
        forward: lockMove || player.frozen ? 0 : slice.forward || 0,
        side: lockMove || player.frozen ? 0 : slice.side || 0,
        walk: !!slice.walk,
        crouch: !!slice.crouch,
        jump: false
      }
      if (!lockMove && !player.frozen) {
        if (slice.jump) player.jumpBuffer = 0.14
        player.jumpBuffer -= dt / subs
        if (player.grounded && player.jumpBuffer > 0) {
          moveInput.jump = true
          player.jumpBuffer = 0
        }
        applyLocomotion(match.physics.solids, player, moveInput, dt / subs, otherSolids(s, player))
      }
      if (s.phase === 'live' && player.bot && slice.fire && sub === 0 && s.time >= player.nextFire && player.reloadT <= 0) {
        fireShot(match, player.id, { yaw: player.lookYaw + player.punchYaw, pitch: player.lookPitch + player.punchPitch })
      }
      if (s.phase === 'live' && !player.bot && player.reloadT <= 0) {
        const weapon = activeWeapon(player)
        const rewindTick = input.rewind && typeof input.tick === 'number' && input.tick < s.tick ? input.tick : undefined
        if (weapon.auto && slice.fire) {
          const pressU = input.sub?.pressU ?? 0
          if (u1 >= pressU && s.time >= player.nextFire) {
            const aim = anglesFor(input, Math.max(pressU, u0), player)
            fireShot(match, player.id, {
              yaw: aim.yaw + player.punchYaw,
              pitch: aim.pitch + player.punchPitch,
              rewindTick
            })
          }
        } else if (!weapon.auto && input.sub?.fireU) {
          for (const fu of input.sub.fireU) {
            if (fu > u0 && fu <= u1 && s.time >= player.nextFire) {
              const aim = anglesFor(input, fu, player)
              fireShot(match, player.id, {
                yaw: aim.yaw + player.punchYaw,
                pitch: aim.pitch + player.punchPitch,
                rewindTick
              })
            }
          }
        } else if (!weapon.auto && slice.fire && !player.fireHeld && sub === 0 && s.time >= player.nextFire) {
          fireShot(match, player.id, {
            yaw: player.lookYaw + player.punchYaw,
            pitch: player.lookPitch + player.punchPitch,
            rewindTick
          })
        }
      }
    }
    player.fireHeld = !!buttonsAt(input, 1).fire
    const endButtons = buttonsAt(input, 1)
    if (endButtons.aim && !player.aimLatch) {
      const weapon = activeWeapon(player)
      if (weapon.scope) player.scoped = (player.scoped + 1) % 3
    }
    player.aimLatch = !!endButtons.aim
    player.aiming = !!endButtons.aim && !activeWeapon(player).scope
    if (endButtons.reload && !player.reloadLatch) beginReload(player)
    player.reloadLatch = !!endButtons.reload
    if (player.reloadT > 0) {
      player.reloadT -= dt
      if (player.reloadT <= 0) {
        player.reloadT = 0
        finishReload(player)
      }
    }
    const recover = s.time - player.lastShot < 0.14 ? 1.5 : 8
    player.punchYaw *= Math.exp(-recover * dt)
    player.punchPitch *= Math.exp(-recover * dt)
    if (s.time - player.lastShot > 0.4) player.recoilIdx = 0
    if (s.phase === 'live' && !lockMove) tryUse(match, player, dt, endButtons)
    else {
      player.planting = 0
      player.defusing = 0
    }
    if (player.alive) touchWorld(match, player)
    if (s.bomb.state === 'carried' && s.bomb.carrier === player.id) {
      s.bomb.pos = { x: player.pos.x, y: player.pos.y + 0.35, z: player.pos.z }
    }
  }

  s.killfeed = s.killfeed.filter((k) => s.time - k.t < 5.2).slice(-6)
  recordHistory(s)
}

/** @param {object} match @param {object} orders */
export function applyOrders(match, orders) {
  if (!orders) return
  for (const id of Object.keys(orders)) {
    const player = match.state.players.find((p) => p.id === id)
    if (!player || !player.bot || player.frozen) continue
    const o = orders[id]
    player.order = {
      yaw: o.yaw,
      pitch: o.pitch,
      forward: o.forward || 0,
      side: o.side || 0,
      walk: !!o.walk,
      crouch: !!o.crouch,
      jump: !!o.jump,
      fire: !!o.fire,
      aim: !!o.aim,
      reload: !!o.reload,
      use: !!o.use,
      drop: false,
      slot: null
    }
    if (o.buys && player.didBuyRound !== match.state.round) {
      player.didBuyRound = match.state.round
      for (const item of o.buys) {
        const res = purchase(player, match.state, item)
        if (res?.dropped) dropEntry(match, player, res.dropped)
      }
    }
    if (o.slot) setSlot(player, o.slot)
    if (o.throw && player.loadout.grenades.includes(o.throw)) {
      player.lookYaw = o.yaw
      player.lookPitch = o.pitch
      throwGrenade(match, player, o.throw, 'far')
    }
  }
}

/** @param {object} match @param {string} id @param {string} itemId */
export function buyItem(match, id, itemId) {
  const player = match.state.players.find((p) => p.id === id)
  if (!player) return { ok: false, reason: 'missing' }
  const res = purchase(player, match.state, itemId)
  if (res?.dropped) dropEntry(match, player, res.dropped)
  if (res?.ok) pushEvent(match.state, { type: 'buy', id, item: itemId })
  return res
}

/** @param {object} match @param {string} id @param {{x:number,y:number,z:number}} pos @param {number} [yaw] */
export function teleport(match, id, pos, yaw) {
  const player = match.state.players.find((p) => p.id === id)
  if (!player) return
  player.pos = { x: pos.x, y: pos.y, z: pos.z }
  player.vel = { x: 0, y: 0, z: 0 }
  if (yaw !== undefined) player.lookYaw = yaw
  player.grounded = true
}

/** @param {object} match @param {string} id */
export function giveBomb(match, id) {
  const player = match.state.players.find((p) => p.id === id)
  if (!player) return
  for (const p of match.state.players) p.loadout.bomb = false
  player.loadout.bomb = true
  match.state.bomb.state = 'carried'
  match.state.bomb.carrier = id
  match.state.bomb.pos = { ...player.pos }
}

/** @param {object} match */
export function snapshot(match) {
  const s = match.state
  return {
    tick: s.tick,
    time: s.time,
    phase: s.phase,
    phaseTime: s.phaseTime,
    round: s.round,
    score: { ...s.score },
    rounds: s.rounds,
    overtime: s.overtime,
    winner: s.winner,
    banner: s.banner,
    killfeed: s.killfeed,
    bomb: {
      ...s.bomb,
      pos: { ...s.bomb.pos }
    },
    smokes: s.smokes.map((sm) => ({ cells: sm.cells.map((c) => ({ ...c })), life: sm.life })),
    fires: s.fires.map((f) => ({ ...f, pos: { ...f.pos } })),
    grenades: s.grenades.map((g) => ({ ...g, pos: { ...g.pos }, vel: { ...g.vel } })),
    pickups: s.pickups,
    events: s.events.slice(),
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      bot: p.bot,
      alive: p.alive,
      pos: { ...p.pos },
      vel: { ...p.vel },
      lookYaw: p.lookYaw,
      lookPitch: p.lookPitch,
      punchYaw: p.punchYaw,
      punchPitch: p.punchPitch,
      height: p.height,
      health: p.health,
      armor: p.armor,
      helmet: p.helmet,
      money: p.money,
      slot: p.slot,
      scoped: p.scoped,
      flash: p.flash,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      kit: p.kit,
      bomb: p.loadout.bomb,
      planting: p.planting,
      defusing: p.defusing,
      grounded: p.grounded,
      crouch: p.height < 1.4,
      weapon: activeWeapon(p).id,
      mag: activeEntry(p)?.mag ?? 0,
      reserve: activeEntry(p)?.reserve ?? 0,
      nades: p.loadout.grenades.slice(),
      primary: p.loadout.primary?.id || null,
      secondary: p.loadout.secondary?.id || null,
      hurt: p.hurt,
      hurtDir: p.hurtDir,
      moneyPop: p.moneyPop,
      ping: p.ping,
      reload: p.reloadT > 0
    }))
  }
}

export { throwGrenade, inBuyZone, headOf, eyeOf }
