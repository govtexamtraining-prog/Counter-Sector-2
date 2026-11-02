/**
 * de_sector — a compact bomb-defusal map.
 * Solids are axis-aligned boxes in meters. `stand` surfaces are walkable.
 */

function box(minx, miny, minz, maxx, maxy, maxz, mat, stand = false) {
  return { min: [minx, miny, minz], max: [maxx, maxy, maxz], mat, stand }
}

function addStairs(solids, x0, x1, z0, z1, y0, y1, steps) {
  for (let i = 0; i < steps; i++) {
    const t1 = (i + 1) / steps
    const t0 = i / steps
    const y = y0 + (y1 - y0) * t1
    const za = z0 + (z1 - z0) * t0
    const zb = z0 + (z1 - z0) * t1
    const lo = Math.min(za, zb)
    const hi = Math.max(za, zb)
    solids.push(box(x0, 0, lo, x1, Math.max(0.2, y), hi, 'stair', true))
  }
}

const solids = [
  box(-34, -2, -44, 34, 0, 44, 'floor', true),
  box(-34, 6, -44, 34, 7.2, 44, 'ceil', false),

  box(-34, 0, -44, -30, 5, 44, 'wall', false),
  box(30, 0, -44, 34, 5, 44, 'wall', false),
  box(-34, 0, -44, 34, 5, -40, 'wall', false),
  box(-34, 0, 40, 34, 5, 44, 'wall', false),

  // CT / site divider with three gates: A, mid, B
  box(-30, 0, -30, -16, 4, -29, 'wall', false),
  box(-12, 0, -30, -4, 4, -29, 'wall', false),
  box(4, 0, -30, 14, 4, -29, 'wall', false),
  box(18, 0, -30, 30, 4, -29, 'wall', false),

  // Lane separators. Left wall includes a crouch vent at z 6..8.
  box(-11, 0, -16, -10, 4, -8, 'wall', false),
  box(-11, 0, -4, -10, 4, 6, 'wall', false),
  box(-11, 1.45, 6, -10, 4, 8, 'wall', false),
  box(-11, 0, 8, -10, 4, 16, 'wall', false),
  box(-11, 0, 20, -10, 4, 24, 'wall', false),

  box(10, 0, -16, 11, 4, -8, 'wall', false),
  box(10, 0, -4, 11, 4, 16, 'wall', false),
  box(10, 0, 20, 11, 4, 24, 'wall', false),

  // Cover
  box(-24, 0, -25, -21.2, 1.15, -22.2, 'crate', false),
  box(-19, 0, -23.5, -16.6, 0.75, -21.4, 'crate', false),
  box(18, 0, -23, 21.2, 1.15, -20.2, 'crate', false),
  box(22.4, 0, -20, 25.2, 0.7, -17.6, 'crate', false),
  box(-2.2, 0, 1.5, 2.2, 1.15, 5.2, 'crate', false),
  box(-6.5, 0, 8, -4.2, 0.85, 10.4, 'crate', false),
  box(-28, 0, 6, -25.2, 1.05, 8.6, 'crate', false),
  box(24, 0, 12, 27.2, 1.05, 14.8, 'crate', false),
  box(-1.2, 0, -18, 1.2, 1.25, -15.2, 'crate', false),

  // Catwalk in tunnels
  box(14, 2.2, 0, 24, 2.5, 10, 'metal', true)
]

addStairs(solids, 16, 22, -4.2, 0, 0, 2.5, 6)
addStairs(solids, 16, 22, 10, 14.2, 2.5, 0, 6)

export const MAP = {
  name: 'de_sector',
  title: 'SECTOR',
  solids,
  decor: [
    box(-4.35, 0, -30.2, -3.95, 4, -28.8, 'pillar', false),
    box(3.95, 0, -30.2, 4.35, 4, -28.8, 'pillar', false),
    box(-29.6, 3.3, -27, -16.2, 3.7, -26.5, 'sign', false),
    box(16.2, 3.3, -26, 29.6, 3.7, -25.5, 'sign', false),
    box(-0.3, 0, 30, 0.3, 5.5, 0.6, 'antenna', false),
    box(0, 5.2, 29.6, 3.2, 5.45, 30.4, 'antenna', false)
  ],
  sites: {
    A: { id: 'A', minX: -28, maxX: -14, minZ: -28, maxZ: -18 },
    B: { id: 'B', minX: 14, maxX: 28, minZ: -26, maxZ: -16 }
  },
  buyZones: {
    CT: { minX: -30, maxX: 30, minZ: -40, maxZ: -30.2 },
    T: { minX: -30, maxX: 30, minZ: 28, maxZ: 40 }
  },
  spawns: {
    CT: [
      [-10, 0.05, -36, 0],
      [-4, 0.05, -36.5, 0],
      [2, 0.05, -36.5, 0],
      [8, 0.05, -36, 0],
      [0, 0.05, -33.5, 0]
    ],
    T: [
      [-10, 0.05, 35, Math.PI],
      [-4, 0.05, 36, Math.PI],
      [2, 0.05, 36, Math.PI],
      [8, 0.05, 35, Math.PI],
      [0, 0.05, 32.5, Math.PI]
    ]
  },
  holds: {
    CT: [
      { site: 'A', pos: [-22, 0.05, -19], yaw: 0.15 },
      { site: 'A', pos: [-16.5, 0.05, -24], yaw: -0.4 },
      { site: 'B', pos: [20, 0.05, -17.5], yaw: -0.1 },
      { site: 'B', pos: [16.5, 0.05, -22], yaw: 0.6 },
      { site: 'MID', pos: [0, 0.05, -10], yaw: 0 }
    ]
  },
  goals: {
    A: [-21, 0.05, -23],
    B: [21, 0.05, -21],
    MID: [0, 0.05, 2]
  },
  vents: [{ minX: -11, maxX: -10, minZ: 6, maxZ: 8, maxY: 1.45 }]
}

/**
 * @param {{x:number,z:number}} pos
 * @param {'A'|'B'} siteId
 */
export function inSite(pos, siteId) {
  const s = MAP.sites[siteId]
  return pos.x >= s.minX && pos.x <= s.maxX && pos.z >= s.minZ && pos.z <= s.maxZ && pos.y < 1.4
}

/** @param {{x:number,y:number,z:number}} pos @param {'T'|'CT'} team */
export function inBuyZone(pos, team) {
  const z = MAP.buyZones[team]
  return pos.x >= z.minX && pos.x <= z.maxX && pos.z >= z.minZ && pos.z <= z.maxZ && pos.y < 2
}

/** @param {{x:number,z:number}} pos */
export function siteAt(pos) {
  if (inSite(pos, 'A')) return 'A'
  if (inSite(pos, 'B')) return 'B'
  return null
}
