import { RADIUS, STAND_H, STEP_HEIGHT } from '../sim/constants.js'

/**
 * Distance from a point to an AABB. Zero when the point is inside.
 * @param {{x:number,y:number,z:number}} p
 * @param {{min:number[], max:number[]}} box
 */
export function pointAabbDistance(p, box) {
  const cx = Math.max(box.min[0], Math.min(p.x, box.max[0]))
  const cy = Math.max(box.min[1], Math.min(p.y, box.max[1]))
  const cz = Math.max(box.min[2], Math.min(p.z, box.max[2]))
  return Math.hypot(p.x - cx, p.y - cy, p.z - cz)
}

/**
 * Vertical capsule against a world of AABBs.
 * @param {{min:number[], max:number[]}[]} solids
 * @param {{x:number,y:number,z:number}} feet
 * @param {number} height
 * @param {number} radius
 */
export function capsuleIntersects(solids, feet, height, radius) {
  const y0 = feet.y + radius
  const y1 = feet.y + height - radius
  const samples = 5
  for (let i = 0; i < samples; i++) {
    const y = y0 + ((y1 - y0) * i) / (samples - 1)
    const p = { x: feet.x, y, z: feet.z }
    for (let s = 0; s < solids.length; s++) {
      if (pointAabbDistance(p, solids[s]) < radius - 0.004) return true
    }
  }
  return false
}

/**
 * Push a capsule out of solids along the nearest face.
 * @param {{min:number[], max:number[]}[]} solids
 * @param {{x:number,y:number,z:number}} pos
 * @param {number} height
 * @param {number} radius
 */
export function depenetrate(solids, pos, height, radius) {
  for (let iter = 0; iter < 6; iter++) {
    if (!capsuleIntersects(solids, pos, height, radius)) return true
    const y0 = pos.y + radius
    const y1 = pos.y + height - radius
    let best = null
    for (let i = 0; i < 4; i++) {
      const y = y0 + ((y1 - y0) * i) / 3
      const p = { x: pos.x, y, z: pos.z }
      for (const box of solids) {
        const cx = Math.max(box.min[0], Math.min(p.x, box.max[0]))
        const cy = Math.max(box.min[1], Math.min(p.y, box.max[1]))
        const cz = Math.max(box.min[2], Math.min(p.z, box.max[2]))
        const dx = p.x - cx
        const dy = p.y - cy
        const dz = p.z - cz
        const d = Math.hypot(dx, dy, dz)
        if (d >= radius - 0.004) continue
        const pen = radius - d + 0.002
        let ax = 0
        let ay = 0
        let az = 0
        if (d < 1e-5) {
          const faces = [
            [p.x - box.min[0], -1, 0, 0],
            [box.max[0] - p.x, 1, 0, 0],
            [p.y - box.min[1], 0, -1, 0],
            [box.max[1] - p.y, 0, 1, 0],
            [p.z - box.min[2], 0, 0, -1],
            [box.max[2] - p.z, 0, 0, 1]
          ]
          faces.sort((a, b) => a[0] - b[0])
          ax = faces[0][1]
          ay = faces[0][2]
          az = faces[0][3]
        } else {
          ax = dx / d
          ay = dy / d
          az = dz / d
        }
        if (!best || pen > best.pen) best = { pen, ax, ay, az }
      }
    }
    if (!best) break
    pos.x += best.ax * best.pen
    pos.y += best.ay * best.pen
    pos.z += best.az * best.pen
  }
  return !capsuleIntersects(solids, pos, height, radius)
}

function tryStep(solids, pos, dx, dz, height, radius) {
  const startY = pos.y
  pos.y += STEP_HEIGHT
  if (capsuleIntersects(solids, pos, height, radius)) {
    pos.y = startY
    return false
  }
  pos.x += dx
  pos.z += dz
  if (capsuleIntersects(solids, pos, height, radius)) {
    pos.x -= dx
    pos.z -= dz
    pos.y = startY
    return false
  }
  const drop = STEP_HEIGHT / 6
  for (let i = 0; i < 6; i++) {
    pos.y -= drop
    if (capsuleIntersects(solids, pos, height, radius)) {
      pos.y += drop
      break
    }
  }
  return true
}

/**
 * Discrete slide move. `pos` is the feet. Returns whether the body is grounded.
 * @param {{min:number[], max:number[]}[]} solids
 * @param {{x:number,y:number,z:number}} pos
 * @param {{x:number,y:number,z:number}} vel
 * @param {number} height
 * @param {number} radius
 * @param {number} dt
 */
export function moveBody(solids, pos, vel, height, radius, dt) {
  const sub = 4
  const sdt = dt / sub
  let grounded = false
  for (let i = 0; i < sub; i++) {
    pos.x += vel.x * sdt
    if (capsuleIntersects(solids, pos, height, radius)) {
      pos.x -= vel.x * sdt
      if (!tryStep(solids, pos, vel.x * sdt, 0, height, radius)) vel.x = 0
    }
    pos.z += vel.z * sdt
    if (capsuleIntersects(solids, pos, height, radius)) {
      pos.z -= vel.z * sdt
      if (!tryStep(solids, pos, 0, vel.z * sdt, height, radius)) vel.z = 0
    }
    pos.y += vel.y * sdt
    if (capsuleIntersects(solids, pos, height, radius)) {
      pos.y -= vel.y * sdt
      if (vel.y <= 0) grounded = true
      vel.y = 0
    }
  }
  if (vel.y <= 0) {
    const start = pos.y
    let hit = false
    for (let i = 0; i < 12; i++) {
      pos.y -= 0.02
      if (capsuleIntersects(solids, pos, height, radius)) {
        pos.y += 0.02
        hit = true
        break
      }
    }
    if (!hit) pos.y = start
    else {
      grounded = true
      if (vel.y < 0) vel.y = 0
    }
  }
  return grounded
}

/**
 * Slab ray against one AABB. Direction should be normalized.
 * @param {{x:number,y:number,z:number}} o
 * @param {{x:number,y:number,z:number}} d
 * @param {number[]} min
 * @param {number[]} max
 * @param {number} maxDist
 */
export function rayAabb(o, d, min, max, maxDist) {
  const oArr = [o.x, o.y, o.z]
  const dArr = [d.x, d.y, d.z]
  let tmin = 0
  let tmax = maxDist
  const nSign = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dArr[i]) < 1e-8) {
      if (oArr[i] < min[i] || oArr[i] > max[i]) return null
      continue
    }
    const inv = 1 / dArr[i]
    let t1 = (min[i] - oArr[i]) * inv
    let t2 = (max[i] - oArr[i]) * inv
    // sign -1 = entered through the min face, +1 = entered through the max face
    let sign = -1
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
      sign = 1
    }
    if (t1 > tmin) {
      tmin = t1
      nSign[0] = 0
      nSign[1] = 0
      nSign[2] = 0
      nSign[i] = sign
    }
    if (t2 < tmax) tmax = t2
    if (tmax < tmin) return null
  }
  if (tmin <= 0.00001 || tmin > maxDist) return null
  const point = { x: o.x + d.x * tmin, y: o.y + d.y * tmin, z: o.z + d.z * tmin }
  return { t: tmin, point, normal: { x: nSign[0], y: nSign[1], z: nSign[2] } }
}

/**
 * @param {{min:number[], max:number[], mat?:string}[]} solids
 * @param {{x:number,y:number,z:number}} origin
 * @param {{x:number,y:number,z:number}} dir
 * @param {number} maxDist
 */
export function raycastSolids(solids, origin, dir, maxDist) {
  let best = null
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i]
    const hit = rayAabb(origin, dir, s.min, s.max, maxDist)
    if (hit && (!best || hit.t < best.t)) {
      best = { t: hit.t, point: hit.point, normal: hit.normal, mat: s.mat || 'wall', index: i }
    }
  }
  return best
}

/**
 * True when a standing capsule can travel the segment.
 * @param {{min:number[], max:number[]}[]} solids
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @param {number} [radius]
 * @param {number} [height]
 */
export function segmentClear(solids, a, b, radius = RADIUS, height = STAND_H) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  const steps = Math.max(1, Math.ceil(dist / 0.7))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const feet = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t
    }
    if (capsuleIntersects(solids, feet, height, radius)) return false
  }
  return true
}

/**
 * Ray vs sphere. Returns distance or null.
 * @param {{x:number,y:number,z:number}} o
 * @param {{x:number,y:number,z:number}} d
 * @param {{x:number,y:number,z:number}} c
 * @param {number} r
 */
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x
  const oy = o.y - c.y
  const oz = o.z - c.z
  const b = ox * d.x + oy * d.y + oz * d.z
  const c0 = ox * ox + oy * oy + oz * oz - r * r
  const disc = b * b - c0
  if (disc < 0) return null
  const s = Math.sqrt(disc)
  const t = -b - s
  if (t > 0.001) return t
  const t2 = -b + s
  return t2 > 0.001 ? t2 : null
}

/**
 * Ray vs vertical cylinder segment (body). Returns distance or null.
 * @param {{x:number,y:number,z:number}} o
 * @param {{x:number,y:number,z:number}} d
 * @param {number} x
 * @param {number} z
 * @param {number} y0
 * @param {number} y1
 * @param {number} r
 */
export function rayCylinderY(o, d, x, z, y0, y1, r) {
  const ox = o.x - x
  const oz = o.z - z
  const a = d.x * d.x + d.z * d.z
  const b = 2 * (ox * d.x + oz * d.z)
  const c = ox * ox + oz * oz - r * r
  let tHit = null
  if (a > 1e-8) {
    const disc = b * b - 4 * a * c
    if (disc >= 0) {
      const s = Math.sqrt(disc)
      const t1 = (-b - s) / (2 * a)
      const t2 = (-b + s) / (2 * a)
      for (const t of [t1, t2]) {
        if (t > 0.001) {
          const y = o.y + d.y * t
          if (y >= y0 && y <= y1) {
            tHit = tHit === null ? t : Math.min(tHit, t)
          }
        }
      }
    }
  }
  return tHit
}
