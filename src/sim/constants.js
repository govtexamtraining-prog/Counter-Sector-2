/** Shared numeric constants for the tactical sim. Distances are meters. */
export const TICK = 1 / 64
export const GRAVITY = 22
export const JUMP_SPEED = 7.15
export const RADIUS = 0.32
export const STAND_H = 1.76
export const CROUCH_H = 1.22
export const STEP_HEIGHT = 0.45
export const EYE_DROP = 0.18
export const MAX_HEALTH = 100
export const MAX_ARMOR = 100
export const MAX_MONEY = 16000
export const START_MONEY = 800
export const BUY_TIME = 20
export const FREEZE_TAIL = 3
export const LIVE_TIME = 115
export const END_TIME = 5
export const HALF_TIME = 8
export const BOMB_TIME = 40
export const PLANT_TIME = 3.2
export const DEFUSE_TIME = 10
export const DEFUSE_KIT_TIME = 5
export const HISTORY = 128

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
export function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * @param {number} cur
 * @param {number} target
 * @param {number} maxDelta
 */
export function moveToward(cur, target, maxDelta) {
  const d = target - cur
  if (Math.abs(d) <= maxDelta) return target
  return cur + Math.sign(d) * maxDelta
}

/**
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 */
export function dist3(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.hypot(dx, dy, dz)
}

/**
 * @param {{x:number,z:number}} a
 * @param {{x:number,z:number}} b
 */
export function dist2(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** @param {number} x @param {number} y @param {number} z */
export function v3(x, y, z) {
  return { x, y, z }
}

/**
 * @param {number} yaw
 * @param {number} pitch
 */
export function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch)
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp }
}

/** @param {{x:number,y:number,z:number}} d */
export function anglesFromDir(d) {
  const yaw = Math.atan2(d.x, d.z)
  const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
  return { yaw, pitch }
}

/** @param {{x:number,y:number,z:number}} d */
export function normalize(d) {
  const l = Math.hypot(d.x, d.y, d.z) || 1
  return { x: d.x / l, y: d.y / l, z: d.z / l }
}

/**
 * @param {number} yaw
 */
export function basis(yaw) {
  return {
    forward: { x: Math.sin(yaw), z: Math.cos(yaw) },
    right: { x: Math.cos(yaw), z: -Math.sin(yaw) }
  }
}
