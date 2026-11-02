import { RADIUS, STAND_H } from './constants.js'
import { capsuleIntersects } from '../physics/collisions.js'

/**
 * Walkable graph baked from stand-surfaces. Links are short steps a capsule can cross.
 * @param {object[]} solids
 */
export function buildNav(solids) {
  const nodes = []
  const step = 1.4
  const stand = solids.filter((s) => s.stand)
  for (let x = -30; x <= 30; x += step) {
    for (let z = -40; z <= 40; z += step) {
      const tops = new Set([0.02])
      for (let i = 0; i < stand.length; i++) {
        const s = stand[i]
        if (x < s.min[0] || x > s.max[0] || z < s.min[2] || z > s.max[2]) continue
        tops.add(Math.round((s.max[1] + 0.02) * 20) / 20)
      }
      for (const y of tops) {
        const feet = { x, y, z }
        if (!capsuleIntersects(solids, feet, STAND_H, RADIUS)) nodes.push(feet)
      }
    }
  }

  const buckets = {}
  const key = (x, z) => `${Math.round(x / step)}:${Math.round(z / step)}`
  for (let i = 0; i < nodes.length; i++) {
    const k = key(nodes[i].x, nodes[i].z)
    if (!buckets[k]) buckets[k] = []
    buckets[k].push(i)
  }

  const links = new Array(nodes.length)
  for (let i = 0; i < nodes.length; i++) links[i] = []

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const cx = Math.round(n.x / step)
    const cz = Math.round(n.z / step)
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const list = buckets[`${cx + ox}:${cz + oz}`]
        if (!list) continue
        for (let k = 0; k < list.length; k++) {
          const j = list[k]
          if (j <= i) continue
          const m = nodes[j]
          const dy = m.y - n.y
          const d = Math.hypot(m.x - n.x, dy, m.z - n.z)
          if (d > 2.2 || Math.abs(dy) > 0.7) continue
          if (capsuleIntersects(solids, {
            x: (n.x + m.x) / 2,
            y: (n.y + m.y) / 2,
            z: (n.z + m.z) / 2
          }, STAND_H, RADIUS)) continue
          links[i].push(j)
          links[j].push(i)
        }
      }
    }
  }

  return { nodes, links, buckets, step }
}

/** @param {object} nav @param {{x:number,y:number,z:number}} pos */
export function nearestNode(nav, pos) {
  const cx = Math.round(pos.x / nav.step)
  const cz = Math.round(pos.z / nav.step)
  let best = -1
  let bestD = 1e9
  for (let ox = -4; ox <= 4; ox++) {
    for (let oz = -4; oz <= 4; oz++) {
      const list = nav.buckets[`${cx + ox}:${cz + oz}`]
      if (!list) continue
      for (let k = 0; k < list.length; k++) {
        const i = list[k]
        const n = nav.nodes[i]
        const dy = n.y - pos.y
        if (Math.abs(dy) > 1.35) continue
        const d = (n.x - pos.x) ** 2 + (n.z - pos.z) ** 2 + dy * dy
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
    }
  }
  if (best >= 0) return best
  for (let i = 0; i < nav.nodes.length; i++) {
    const n = nav.nodes[i]
    const d = (n.x - pos.x) ** 2 + (n.z - pos.z) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/**
 * A* over the baked graph. Returns foot-space waypoints.
 * @param {object} nav
 * @param {{x:number,y:number,z:number}} start
 * @param {{x:number,y:number,z:number}} goal
 */
export function findPath(nav, start, goal) {
  const s = nearestNode(nav, start)
  const g = nearestNode(nav, goal)
  if (s < 0 || g < 0) return []
  if (s === g) return [{ ...nav.nodes[s] }]
  const h = (i) => {
    const n = nav.nodes[i]
    const t = nav.nodes[g]
    return Math.hypot(n.x - t.x, n.y - t.y, n.z - t.z)
  }
  const open = [s]
  const gScore = new Float64Array(nav.nodes.length)
  const fScore = new Float64Array(nav.nodes.length)
  const came = new Int32Array(nav.nodes.length)
  const inOpen = new Uint8Array(nav.nodes.length)
  gScore.fill(1e12)
  fScore.fill(1e12)
  came.fill(-1)
  gScore[s] = 0
  fScore[s] = h(s)
  inOpen[s] = 1

  while (open.length) {
    let bi = 0
    for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i
    const cur = open[bi]
    open.splice(bi, 1)
    inOpen[cur] = 0
    if (cur === g) break
    const nbrs = nav.links[cur]
    for (let k = 0; k < nbrs.length; k++) {
      const nb = nbrs[k]
      const a = nav.nodes[cur]
      const b = nav.nodes[nb]
      const step = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
      const tentative = gScore[cur] + step
      if (tentative < gScore[nb]) {
        came[nb] = cur
        gScore[nb] = tentative
        fScore[nb] = tentative + h(nb)
        if (!inOpen[nb]) {
          open.push(nb)
          inOpen[nb] = 1
        }
      }
    }
  }
  if (came[g] < 0 && s !== g) return [{ ...goal }]
  const path = []
  let cur = g
  path.push({ ...nav.nodes[cur] })
  while (cur !== s && came[cur] >= 0) {
    cur = came[cur]
    path.push({ ...nav.nodes[cur] })
    if (path.length > nav.nodes.length) break
  }
  path.reverse()
  return path
}
