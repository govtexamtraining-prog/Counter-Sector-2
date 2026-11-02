import { normalize } from '../sim/constants.js'
import { activeWeapon } from '../sim/weapons.js'

/** Cone in radians around the aim direction. */
export function computeSpread(player, weapon) {
  if (player._perfect) return 0
  let spread = weapon.baseSpread || 0
  if (weapon.scope && player.scoped > 0) spread = weapon.scopedSpread ?? 0.001
  const speed = Math.hypot(player.vel.x, player.vel.z)
  if (!player.grounded) spread += weapon.airSpread || 0
  else spread += speed * (weapon.moveSpread || 0)
  if (player.height < 1.4) spread *= weapon.crouchMul ?? 0.6
  if (player.aiming && !weapon.scope) spread *= weapon.aimMul ?? 0.8
  if (weapon.scope && player.scoped > 0 && speed > 0.5) spread += 0.045
  if (player.flash > 0.15) spread += player.flash * 0.09
  return spread
}

/**
 * @param {{x:number,y:number,z:number}} dir
 * @param {number} spread
 * @param {() => number} rnd
 */
export function deflect(dir, spread, rnd) {
  if (spread <= 0) return dir
  const ax = Math.abs(dir.y) > 0.92 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  let rx = dir.y * ax.z - dir.z * ax.y
  let ry = dir.z * ax.x - dir.x * ax.z
  let rz = dir.x * ax.y - dir.y * ax.x
  const rl = Math.hypot(rx, ry, rz) || 1
  rx /= rl
  ry /= rl
  rz /= rl
  const ux = ry * dir.z - rz * dir.y
  const uy = rz * dir.x - rx * dir.z
  const uz = rx * dir.y - ry * dir.x
  const ang = rnd() * Math.PI * 2
  const mag = rnd() * spread
  const c = Math.cos(ang) * mag
  const s = Math.sin(ang) * mag
  return normalize({
    x: dir.x + rx * c + ux * s,
    y: dir.y + ry * c + uy * s,
    z: dir.z + rz * c + uz * s
  })
}
