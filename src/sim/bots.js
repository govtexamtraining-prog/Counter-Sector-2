import { dirFromAngles } from './constants.js'
import { activeEntry, activeWeapon, GEAR, WEAPONS, defaultPistol } from './weapons.js'
import { eyeOf } from '../physics/hitreg.js'
import { smokeFactor } from './grenades.js'
import { findPath } from './nav.js'
import { MAP } from './map.js'
import { dist2, dist3, lerpAngle } from './constants.js'

export const DIFFICULTY = {
  easy: { react: [0.34, 0.55], aim: 0.1, comp: 0.28, see: 0.2 },
  normal: { react: [0.15, 0.3], aim: 0.045, comp: 0.66, see: 0.42 },
  hard: { react: [0.08, 0.16], aim: 0.02, comp: 0.9, see: 0.55 }
}

function slew(cur, target, rate, dt) {
  let d = target - cur
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  const max = rate * dt
  if (Math.abs(d) <= max) return cur + d
  return cur + Math.sign(d) * max
}

function memFor(memory, id, round) {
  if (!memory[id] || memory[id].round !== round) {
    memory[id] = {
      round,
      sentBuy: false,
      path: null,
      pathI: 0,
      pathAge: 10,
      stuck: 0,
      strafe: 1,
      strafeT: 0,
      enemy: null,
      reactAt: 0,
      smoked: false,
      flashedThrow: false,
      holdYaw: null
    }
  }
  return memory[id]
}

function vecTo(a, b) {
  return { x: b[0] - a.x, y: (b[1] || 0) - a.y, z: b[2] - a.z }
}

function goalFor(p, state) {
  const bomb = state.bomb
  if (p.team === 'CT' && bomb?.state === 'planted') return { x: bomb.pos.x, y: 0.05, z: bomb.pos.z, mode: 'defuse' }
  if (p.team === 'T' && bomb?.state === 'dropped') {
    let best = null
    let bd = 1e9
    for (const o of state.players) {
      if (o.team !== 'T' || !o.alive) continue
      const d = dist2(o.pos, bomb.pos)
      if (d < bd) {
        bd = d
        best = o
      }
    }
    if (best && best.id === p.id) return { x: bomb.pos.x, y: 0.05, z: bomb.pos.z, mode: 'fetch' }
  }
  if (p.team === 'T' && (bomb?.carrier === p.id || p.loadout.bomb)) {
    const g = MAP.goals[p.goalSite] || MAP.goals.A
    return { x: g[0], y: g[1], z: g[2], mode: 'plant' }
  }
  if (p.team === 'T' && bomb?.state === 'planted') {
    const g = MAP.goals[bomb.site] || MAP.goals.A
    return { x: g[0], y: 0.05, z: g[2] + 3, mode: 'hold' }
  }
  if (p.team === 'CT') {
    const holds = MAP.holds.CT.filter((h) => h.site === (p.goalSite || 'MID'))
    const h = holds[0] || MAP.holds.CT[4]
    return { x: h.pos[0], y: h.pos[1], z: h.pos[2], yaw: h.yaw, mode: 'hold' }
  }
  const g = MAP.goals[p.goalSite] || MAP.goals.A
  return { x: g[0], y: g[1], z: g[2], mode: 'rush' }
}

function priceOf(id) {
  return (WEAPONS[id] || GEAR[id])?.price || 0
}

function planBuy(p, state) {
  const buys = []
  let money = p.money
  const take = (id) => {
    const cost = priceOf(id)
    if (cost > money) return false
    buys.push(id)
    money -= cost
    return true
  }
  if (!p.helmet) take('vesthelm')
  else if (p.armor < 40) take('vest')
  const pistolRound = state.pistolRound
  if (pistolRound) {
    if (Math.abs(hash(p.id + state.round)) % 2 === 0) take('deagle')
    else take('p250')
  } else if (!p.loadout.primary) {
    const rifle = p.team === 'T' ? 'ak47' : 'm4a1'
    const cheap = p.team === 'T' ? 'galil' : 'famas'
    const smg = p.team === 'T' ? 'mac10' : 'mp9'
    if (!take(rifle)) if (!take(cheap)) take(smg)
    if (money > 5200 && hash(p.id) % 5 === 0) take('awp')
  }
  if (money > 800) take('smoke')
  if (money > 500) take('flash')
  if (money > 700) take('he')
  if (p.team === 'CT' && !p.kit) take('kit')
  if (p.team === 'T' && money > 600) take('molotov')
  return buys
}

function hash(str) {
  let h = 0
  const s = String(str)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * Line of sight and footstep/shot hearing. Raycasts stay on the calling thread.
 * @param {object} state
 * @param {{raycast: Function}} physics
 */
export function buildSenses(state, physics) {
  const diff = DIFFICULTY[state.difficulty] || DIFFICULTY.normal
  const senses = {}
  for (const p of state.players) {
    if (!p.bot || !p.alive) continue
    const visible = []
    const eye = eyeOf(p)
    const look = dirFromAngles(p.lookYaw, p.lookPitch)
    for (const o of state.players) {
      if (o === p || !o.alive || o.team === p.team) continue
      const target = eyeOf(o)
      const to = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z }
      const dist = Math.hypot(to.x, to.y, to.z) || 0.001
      const dir = { x: to.x / dist, y: to.y / dist, z: to.z / dist }
      const dot = look.x * dir.x + look.y * dir.y + look.z * dir.z
      if (dot < diff.see && dist > 3.2) continue
      if (smokeFactor(state.smokes, eye, target) > 0.42) continue
      const wall = physics.raycast(eye, dir, dist)
      if (wall && wall.t < dist - 0.45) continue
      visible.push({ id: o.id, x: o.pos.x, y: target.y, z: o.pos.z, dist })
    }
    const noises = []
    for (const o of state.players) {
      if (!o.alive || o.team === p.team) continue
      const d = dist2(p.pos, o.pos)
      const sp = Math.hypot(o.vel.x, o.vel.z)
      if (state.time - (o.lastShot || -10) < 0.35 && d < 38) noises.push({ x: o.pos.x, y: o.pos.y, z: o.pos.z })
      else if (sp > 4.2 && d < 17) noises.push({ x: o.pos.x, y: o.pos.y, z: o.pos.z })
      else if (sp > 1.6 && sp < 3 && d < 8) noises.push({ x: o.pos.x, y: o.pos.y, z: o.pos.z })
    }
    senses[p.id] = { visible, noises }
  }
  return senses
}

/**
 * Behavior tree: buy, path, hold, trade, plant, defuse, utility.
 * `memory` persists reaction timers between calls (including inside the worker).
 * @param {object} state
 * @param {object} nav
 * @param {object} senses
 * @param {number} dt
 * @param {object} memory
 */
export function planBots(state, nav, senses, dt, memory = {}) {
  const diff = DIFFICULTY[state.difficulty] || DIFFICULTY.normal
  const orders = {}
  for (const p of state.players) {
    if (!p.bot || !p.alive || p.frozen) continue
    const mem = memFor(memory, p.id, state.round)
    const order = {
      yaw: p.lookYaw,
      pitch: p.lookPitch,
      forward: 0,
      side: 0,
      crouch: false,
      jump: false,
      fire: false,
      use: false,
      reload: false,
      aim: false,
      buys: null,
      throw: null,
      slot: null
    }
    if (state.phase === 'buy' && p.didBuyRound !== state.round && !mem.sentBuy && inZone(p)) {
      mem.sentBuy = true
      order.buys = planBuy(p, state)
    }
    if (state.phase !== 'live') {
      orders[p.id] = order
      continue
    }

    const sense = senses[p.id] || { visible: [], noises: [] }
    const enemy = sense.visible.slice().sort((a, b) => a.dist - b.dist)[0]
    if (enemy) {
      if (!mem.enemy || mem.enemy.id !== enemy.id) {
        const delay = diff.react[0] + ((hash(p.id + state.time) % 100) / 100) * (diff.react[1] - diff.react[0])
        mem.reactAt = state.time + delay
      }
      mem.enemy = { ...enemy, seen: state.time }
    } else if (mem.enemy && state.time - mem.enemy.seen > 2.4) mem.enemy = null

    const goal = goalFor(p, state)
    let aimX = goal.x
    let aimY = goal.y + 1.4
    let aimZ = goal.z
    let fighting = false
    if (mem.enemy) {
      aimX = mem.enemy.x
      aimY = mem.enemy.y
      aimZ = mem.enemy.z
      fighting = true
    } else if (sense.noises[0]) {
      aimX = sense.noises[0].x
      aimY = sense.noises[0].y + 1.4
      aimZ = sense.noises[0].z
    }

    const dx = aimX - p.pos.x
    const dz = aimZ - p.pos.z
    const flat = Math.hypot(dx, dz) || 0.001
    let wantYaw = Math.atan2(dx, dz)
    let wantPitch = Math.atan2(aimY - (p.pos.y + p.height - 0.18), flat)
    if (fighting) wantPitch -= (p.punchPitch || 0) * diff.comp
    const rate = fighting ? 11 : 4.2
    order.yaw = slew(p.lookYaw, wantYaw, rate, dt)
    order.pitch = slew(p.lookPitch, Math.max(-1.2, Math.min(1.2, wantPitch)), rate, dt)

    mem.pathAge += dt
    const goalMoved = !mem.goal || Math.hypot(mem.goal.x - goal.x, mem.goal.z - goal.z) > 2
    if (!mem.path || mem.pathAge > 1.4 || goalMoved) {
      mem.path = nav ? findPath(nav, p.pos, goal) : []
      mem.pathI = 0
      mem.pathAge = 0
      mem.goal = { x: goal.x, z: goal.z }
    }
    let wp = goal
    if (mem.path && mem.path.length) {
      while (mem.pathI < mem.path.length - 1 && dist2(p.pos, mem.path[mem.pathI]) < 0.9) mem.pathI++
      wp = mem.path[Math.min(mem.pathI, mem.path.length - 1)]
    }

    const speed = Math.hypot(p.vel?.x || 0, p.vel?.z || 0)
    if (!fighting && dist2(p.pos, wp) > 0.8) {
      mem.stuck = speed < 0.25 ? mem.stuck + dt : 0
      if (mem.stuck > 0.9) {
        order.jump = true
        mem.stuck = 0
        mem.pathAge = 10
      }
      if ((wp.y || 0) > p.pos.y + 0.45 && dist2(p.pos, wp) < 1.8) order.jump = true
      order.forward = 1
      const travel = Math.atan2(wp.x - p.pos.x, wp.z - p.pos.z)
      if (!fighting && !sense.noises.length && goal.mode !== 'defuse') {
        order.yaw = slew(p.lookYaw, travel, 4.2, dt)
      }
      if (dist2(p.pos, goal) > 16 && !p.loadout.primary === false && activeWeapon(p).slot !== 'melee' && !fighting) {
        order.slot = 'melee'
      }
    }

    if (goal.mode === 'hold' && !fighting && dist2(p.pos, goal) < 1.6) {
      order.forward = 0
      order.crouch = true
      if (goal.yaw !== undefined) order.yaw = slew(p.lookYaw, goal.yaw, 3, dt)
    }

    if (fighting && mem.enemy && state.time >= mem.reactAt && p.flash < 0.55) {
      mem.strafeT -= dt
      if (mem.strafeT <= 0) {
        mem.strafe = -mem.strafe
        mem.strafeT = 0.35 + (hash(p.id + Math.floor(state.time * 2)) % 50) / 100
      }
      order.side = mem.strafe
      order.forward = dist2(p.pos, mem.enemy) > 14 ? 0.4 : 0
      order.crouch = dist2(p.pos, mem.enemy) > 10
      const yawErr = Math.abs(angleDelta(order.yaw, wantYaw))
      const weapon = activeWeapon(p)
      const entry = activeEntry(p)
      if (weapon.slot === 'melee') order.slot = p.loadout.primary ? 'primary' : 'secondary'
      if (entry && weapon.mag !== undefined && entry.mag <= 0) order.reload = true
      else if (yawErr < 0.12 + diff.aim) order.fire = true
      if (weapon.scope && dist2(p.pos, mem.enemy) > 12) order.aim = true
    } else if (p.flash >= 0.55) {
      order.fire = false
      order.side = mem.strafe
    }

    const entry = activeEntry(p)
    const weapon = activeWeapon(p)
    if (entry && !fighting && weapon.slot !== 'melee' && entry.mag < weapon.mag * 0.3 && entry.reserve > 0) order.reload = true

    if (goal.mode === 'plant' && dist2(p.pos, goal) < 5 && !fighting && p.loadout.bomb) {
      order.forward = dist2(p.pos, goal) > 1.2 ? 1 : 0
      order.use = dist2(p.pos, goal) < 2.4
      order.crouch = order.use
    }
    if (goal.mode === 'defuse' && dist2(p.pos, goal) < 1.8 && (!fighting || (state.bomb?.timer || 40) < 12)) {
      order.forward = 0
      order.use = true
      order.crouch = true
    }

    if (!mem.smoked && p.loadout.grenades?.includes('smoke') && goal.mode === 'plant' && dist2(p.pos, goal) < 10 && !fighting) {
      mem.smoked = true
      order.throw = 'smoke'
      order.pitch = 0.42
    } else if (!mem.flashedThrow && p.loadout.grenades?.includes('flash') && fighting && mem.enemy && mem.enemy.dist < 14 && mem.enemy.dist > 6) {
      mem.flashedThrow = true
      order.throw = 'flash'
      order.pitch = 0.15
    }

    if (order.forward > 0 && weapon.slot === 'melee') {
      /* already requested */
    } else if (fighting && p.loadout.primary && p.slot === 'melee') order.slot = 'primary'

    orders[p.id] = order
  }
  return orders
}

function angleDelta(a, b) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

function inZone(p) {
  if (p.team === 'CT') return p.pos.z < -29
  return p.pos.z > 27
}

export function botNames() {
  return {
    CT: ['Sable', 'Quarry', 'Ledger', 'North', 'Kite'],
    T: ['Marrow', 'Pylon', 'Dune', 'Hinge', 'Cinder']
  }
}

/** Kept so the worker and the server share one planner. */
export function angleToward(from, to) {
  const d = dist3(from, to)
  return {
    yaw: Math.atan2(to.x - from.x, to.z - from.z),
    pitch: Math.atan2(to.y - from.y, Math.max(0.2, d))
  }
}

void lerpAngle
void defaultPistol
void vecTo
void eyeOf
