import { raySphere, rayCylinderY } from './collisions.js'

/** @param {object} p */
export function eyeOf(p) {
  return { x: p.pos.x, y: p.pos.y + p.height - 0.18, z: p.pos.z }
}

/** @param {object} p */
export function headOf(p) {
  return { x: p.pos.x, y: p.pos.y + p.height - 0.15, z: p.pos.z, r: 0.13 }
}

/**
 * Ray against one pawn. Returns the closest hitgroup.
 * @param {object} p
 * @param {{x:number,y:number,z:number}} o
 * @param {{x:number,y:number,z:number}} d
 */
export function rayPawn(p, o, d) {
  if (!p.alive) return null
  const h = p.height
  const head = headOf(p)
  const candidates = []
  const ht = raySphere(o, d, head, head.r)
  if (ht) candidates.push({ t: ht, group: 'head' })
  const chest = rayCylinderY(o, d, p.pos.x, p.pos.z, p.pos.y + h * 0.56, p.pos.y + h - 0.28, 0.28)
  if (chest) candidates.push({ t: chest, group: 'chest' })
  const stomach = rayCylinderY(o, d, p.pos.x, p.pos.z, p.pos.y + h * 0.36, p.pos.y + h * 0.56, 0.26)
  if (stomach) candidates.push({ t: stomach, group: 'stomach' })
  const legs = rayCylinderY(o, d, p.pos.x, p.pos.z, p.pos.y, p.pos.y + h * 0.36, 0.22)
  if (legs) candidates.push({ t: legs, group: 'legs' })
  if (!candidates.length) return null
  candidates.sort((a, b) => a.t - b.t)
  const best = candidates[0]
  return {
    t: best.t,
    group: best.group,
    point: { x: o.x + d.x * best.t, y: o.y + d.y * best.t, z: o.z + d.z * best.t }
  }
}

/**
 * @param {object[]} poses
 * @param {{x:number,y:number,z:number}} origin
 * @param {{x:number,y:number,z:number}} dir
 * @param {number} maxDist
 * @param {string} ignoreId
 * @param {boolean} friendlyFire
 * @param {string} shooterTeam
 */
export function rayPlayers(poses, origin, dir, maxDist, ignoreId, friendlyFire, shooterTeam) {
  let best = null
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i]
    if (!p.alive || p.id === ignoreId) continue
    if (!friendlyFire && p.team === shooterTeam) continue
    const hit = rayPawn(p, origin, dir)
    if (!hit || hit.t > maxDist) continue
    if (!best || hit.t < best.t) best = { ...hit, id: p.id, team: p.team }
  }
  return best
}

/**
 * Damage after hitgroup, helmet, distance and armor. Mutates victim armor.
 * @param {object} victim
 * @param {object} weapon
 * @param {string} group
 * @param {number} dist
 */
export function applyBulletDamage(victim, weapon, group, dist) {
  const groupMul = group === 'head' ? 4 : group === 'stomach' ? 1.25 : group === 'legs' ? 0.75 : 1
  let dmg = weapon.damage * groupMul
  dmg *= Math.pow(weapon.rangeMod || 1, dist / 12)
  if (group === 'head' && victim.helmet && !weapon.ignoreHelmet) dmg *= weapon.helmetScale ?? 0.5
  if (group !== 'legs' && victim.armor > 0) {
    const ratio = weapon.armorRatio ?? 0.5
    const reduced = dmg * ratio
    const armorLoss = (dmg - reduced) * 0.5
    if (armorLoss >= victim.armor) {
      const soaked = victim.armor / 0.5
      victim.armor = 0
      dmg = reduced + Math.max(0, dmg - reduced - soaked)
    } else {
      victim.armor -= armorLoss
      dmg = reduced
    }
  }
  return Math.max(1, dmg)
}

/**
 * Interpolate recorded pawn poses for lag-compensated shots.
 * @param {object} state
 * @param {number} tickFloat
 */
export function posesAt(state, tickFloat) {
  const newest = state.tick
  const oldest = Math.max(0, newest - 120)
  const t = Math.max(oldest, Math.min(newest, tickFloat))
  const i0 = Math.floor(t)
  const i1 = Math.min(newest, i0 + 1)
  const f = t - i0
  const a = state.history[i0 % state.history.length]
  const b = state.history[i1 % state.history.length]
  if (!a) return null
  return a.map((p) => {
    const q = b?.find((x) => x.id === p.id) || p
    return {
      id: p.id,
      alive: f < 0.5 ? p.alive : q.alive,
      team: p.team,
      height: p.height + (q.height - p.height) * f,
      pos: {
        x: p.pos.x + (q.pos.x - p.pos.x) * f,
        y: p.pos.y + (q.pos.y - p.pos.y) * f,
        z: p.pos.z + (q.pos.z - p.pos.z) * f
      }
    }
  })
}
