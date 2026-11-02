import { raycastSolids } from './collisions.js'

/**
 * Gameplay rays prefer Rapier when the wasm world is ready, and always
 * keep an AABB caster so the server, the worker checks, and offline play match.
 * @param {object[]} solids
 */
export function createPhysics(solids) {
  return {
    solids,
    backend: 'aabb',
    rapier: null,
    rapierError: null,
    raycast(origin, dir, maxDist = 200) {
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1
      const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len }
      if (this.rapier) {
        const hit = castRapier(this, origin, d, maxDist)
        if (hit) return hit
      }
      return raycastSolids(this.solids, origin, d, maxDist)
    },
    raycastAabb(origin, dir, maxDist = 200) {
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1
      const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len }
      return raycastSolids(this.solids, origin, d, maxDist)
    }
  }
}

/**
 * Build a static Rapier world mirroring the map boxes.
 * @param {object} physics
 */
export async function attachRapier(physics) {
  try {
    const mod = await import('@dimforge/rapier3d-compat')
    const RAPIER = mod.default
    await RAPIER.init()
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    for (const s of physics.solids) {
      const hx = Math.max(0.05, (s.max[0] - s.min[0]) / 2)
      const hy = Math.max(0.05, (s.max[1] - s.min[1]) / 2)
      const hz = Math.max(0.05, (s.max[2] - s.min[2]) / 2)
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
      const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      desc.setTranslation(
        (s.min[0] + s.max[0]) / 2,
        (s.min[1] + s.max[1]) / 2,
        (s.min[2] + s.max[2]) / 2
      )
      world.createCollider(desc, body)
    }
    world.step()
    physics.rapier = { RAPIER, world }
    physics.backend = 'rapier'
  } catch (err) {
    physics.backend = 'aabb'
    physics.rapierError = String(err?.message || err)
  }
}

function castRapier(physics, origin, dir, maxDist) {
  const { RAPIER, world } = physics.rapier
  const ray = new RAPIER.Ray(origin, dir)
  const hit = world.castRayAndGetNormal(ray, maxDist, true)
  if (!hit) return null
  const t = hit.toi
  if (t <= 0 || t > maxDist) return null
  return {
    t,
    point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
    normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
    mat: 'world',
    backend: 'rapier'
  }
}
