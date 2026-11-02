import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'

/**
 * One merged mesh with a BVH so bullet decals and smoke queries can use the
 * same triangles the player sees.
 * @param {object[]} solids
 */
export function buildBvhMesh(solids) {
  const geometries = []
  for (const s of solids) {
    const sx = s.max[0] - s.min[0]
    const sy = s.max[1] - s.min[1]
    const sz = s.max[2] - s.min[2]
    const geo = new THREE.BoxGeometry(sx, sy, sz)
    geo.translate((s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2)
    geometries.push(geo)
  }
  const merged = mergeGeometries(geometries, false)
  for (const geo of geometries) geo.dispose()
  merged.computeBoundsTree = computeBoundsTree
  merged.computeBoundsTree()
  const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ visible: false }))
  mesh.raycast = acceleratedRaycast
  mesh.frustumCulled = false
  return mesh
}

/**
 * @param {THREE.Mesh} mesh
 * @param {{x:number,y:number,z:number}} origin
 * @param {{x:number,y:number,z:number}} dir
 * @param {number} maxDist
 */
export function bvhRay(mesh, origin, dir, maxDist) {
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(origin.x, origin.y, origin.z),
    new THREE.Vector3(dir.x, dir.y, dir.z).normalize(),
    0,
    maxDist
  )
  raycaster.firstHitOnly = true
  const hits = raycaster.intersectObject(mesh, false)
  return hits[0] || null
}
