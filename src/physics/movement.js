import { JUMP_SPEED, GRAVITY, RADIUS, STAND_H, CROUCH_H, basis } from '../sim/constants.js'
import { activeWeapon } from '../sim/weapons.js'
import { capsuleIntersects, moveBody } from './collisions.js'

function accelerate(vel, wishX, wishZ, wishSpeed, accel, dt) {
  const current = vel.x * wishX + vel.z * wishZ
  const add = wishSpeed - current
  if (add <= 0) return
  let acc = accel * wishSpeed * dt
  if (acc > add) acc = add
  vel.x += wishX * acc
  vel.z += wishZ * acc
}

function friction(vel, dt) {
  const speed = Math.hypot(vel.x, vel.z)
  if (speed < 0.05) {
    vel.x = 0
    vel.z = 0
    return
  }
  const control = Math.max(speed, 1.35)
  const drop = control * 6.2 * dt
  const next = Math.max(0, speed - drop)
  const k = next / speed
  vel.x *= k
  vel.z *= k
}

/**
 * Source-style ground/air accelerate plus capsule slide against the map.
 * `input.jump` is a one-tick edge. Crouch refuses to stand if the ceiling blocks it.
 * @param {object[]} solids
 * @param {object} player
 * @param {object} input
 * @param {number} dt
 * @param {object[]} [extras]
 */
export function applyLocomotion(solids, player, input, dt, extras = []) {
  const world = extras.length ? solids.concat(extras) : solids
  const want = input.crouch ? CROUCH_H : STAND_H
  if (want > player.height + 0.001) {
    const prev = player.height
    player.height = Math.min(want, player.height + dt * 3.4)
    if (capsuleIntersects(world, player.pos, player.height, RADIUS)) player.height = prev
  } else {
    player.height = Math.max(want, player.height - dt * 4)
  }

  const weapon = activeWeapon(player)
  let maxSpeed = 5.55 * (weapon.move || 1)
  if (player.scoped === 2) maxSpeed *= 0.4
  else if (player.scoped === 1) maxSpeed *= 0.58
  if (player.height < 1.4) maxSpeed *= 0.34
  else if (input.walk) maxSpeed *= 0.52
  if (player.planting > 0 || player.defusing > 0) maxSpeed = 0.05

  let forward = input.forward || 0
  let side = input.side || 0
  const wish = Math.hypot(forward, side) || 1
  if (wish > 1) {
    forward /= wish
    side /= wish
  }
  const b = basis(player.lookYaw)
  let wishX = b.forward.x * forward + b.right.x * side
  let wishZ = b.forward.z * forward + b.right.z * side
  const wl = Math.hypot(wishX, wishZ)
  if (wl > 0.001) {
    wishX /= wl
    wishZ /= wl
  } else {
    wishX = 0
    wishZ = 0
  }

  if (player.grounded) {
    friction(player.vel, dt)
    if (wl > 0.001) accelerate(player.vel, wishX, wishZ, maxSpeed, 8.5, dt)
    const sp = Math.hypot(player.vel.x, player.vel.z)
    if (sp > maxSpeed) {
      const k = maxSpeed / sp
      player.vel.x *= k
      player.vel.z *= k
    }
  } else if (wl > 0.001) {
    accelerate(player.vel, wishX, wishZ, Math.min(maxSpeed, 0.95), 14, dt)
    const sp = Math.hypot(player.vel.x, player.vel.z)
    const cap = Math.max(maxSpeed * 1.35, 6.2)
    if (sp > cap) {
      const k = cap / sp
      player.vel.x *= k
      player.vel.z *= k
    }
  }

  if (input.jump && player.grounded) {
    player.vel.y = JUMP_SPEED
    player.grounded = false
  }
  if (!player.grounded) player.vel.y -= GRAVITY * dt

  player.grounded = moveBody(world, player.pos, player.vel, player.height, RADIUS, dt)
  if (player.pos.y < -6) {
    player.pos.y = 0.15
    player.vel.y = 0
  }
}
