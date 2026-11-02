import { dist3, dirFromAngles, normalize } from './constants.js'
import { eyeOf } from '../physics/hitreg.js'
import { pointAabbDistance } from '../physics/collisions.js'

const CELL = 0.72

function cellKey(x, y, z) {
  return `${Math.round(x / CELL)}:${Math.round(y / CELL)}:${Math.round(z / CELL)}`
}

function blocked(solids, p) {
  for (let i = 0; i < solids.length; i++) {
    if (pointAabbDistance(p, solids[i]) < 0.28) return true
  }
  return false
}

/**
 * Flood a smoke volume through empty space, stopped by walls.
 * @param {object[]} solids
 * @param {{x:number,y:number,z:number}} origin
 */
export function igniteSmoke(solids, origin) {
  const cells = []
  const seen = new Set()
  const q = [{ x: origin.x, y: Math.max(0.55, origin.y), z: origin.z }]
  while (q.length && cells.length < 72) {
    const p = q.shift()
    const k = cellKey(p.x, p.y, p.z)
    if (seen.has(k)) continue
    seen.add(k)
    if (Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z) > 3.35) continue
    if (p.y < 0.35 || p.y > 3.1) continue
    if (blocked(solids, p)) continue
    cells.push({ x: p.x, y: p.y, z: p.z, d: 1 })
    q.push(
      { x: p.x + CELL, y: p.y, z: p.z },
      { x: p.x - CELL, y: p.y, z: p.z },
      { x: p.x, y: p.y + CELL, z: p.z },
      { x: p.x, y: p.y - CELL * 0.5, z: p.z },
      { x: p.x, y: p.y, z: p.z + CELL },
      { x: p.x, y: p.y, z: p.z - CELL }
    )
  }
  if (!cells.length) cells.push({ x: origin.x, y: Math.max(0.8, origin.y), z: origin.z, d: 1 })
  return cells
}

function pointSegDist(p, a, b) {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const abz = b.z - a.z
  const apx = p.x - a.x
  const apy = p.y - a.y
  const apz = p.z - a.z
  const ab2 = abx * abx + aby * aby + abz * abz || 1
  let t = (apx * abx + apy * aby + apz * abz) / ab2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z)
}

/** 0 is clear air, 1 is opaque smoke. */
export function smokeFactor(smokes, a, b) {
  let acc = 0
  for (let i = 0; i < smokes.length; i++) {
    const cells = smokes[i].cells
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c]
      if (cell.d < 0.15) continue
      if (pointSegDist(cell, a, b) < 0.62) acc += cell.d * 0.55
    }
  }
  return Math.max(0, Math.min(1, acc))
}

/** Bullets and blasts punch holes through the voxel smoke. */
export function carveSmoke(smokes, a, b, amount = 0.62) {
  for (const smoke of smokes) {
    for (const cell of smoke.cells) {
      if (pointSegDist(cell, a, b) < 0.7) cell.d *= amount
    }
    smoke.cells = smoke.cells.filter((c) => c.d > 0.08)
  }
}

export function clearSmokeRadius(smokes, pos, radius) {
  for (const smoke of smokes) {
    smoke.cells = smoke.cells.filter((c) => Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z) > radius)
  }
}

/**
 * @param {object} match
 * @param {object} player
 * @param {string} kind
 * @param {'far'|'short'} mode
 */
export function throwGrenade(match, player, kind, mode = 'far') {
  const idx = player.loadout.grenades.indexOf(kind)
  if (idx < 0) return false
  player.loadout.grenades.splice(idx, 1)
  if (player.nadeIndex >= player.loadout.grenades.length) player.nadeIndex = 0
  const dir = dirFromAngles(player.lookYaw + player.punchYaw, player.lookPitch + player.punchPitch)
  const speed = mode === 'short' ? 8.2 : 16.2
  const eye = eyeOf(player)
  match.state.grenades.push({
    id: `n${match.ids++}`,
    kind,
    owner: player.id,
    live: true,
    fuse: kind === 'flash' ? 1.35 : kind === 'molotov' ? 2.4 : 1.55,
    pos: { x: eye.x + dir.x * 0.35, y: eye.y - 0.05, z: eye.z + dir.z * 0.35 },
    vel: {
      x: dir.x * speed + player.vel.x * 0.4,
      y: dir.y * speed + 1.1,
      z: dir.z * speed + player.vel.z * 0.4
    }
  })
  match.state.events.push({ type: 'throw', id: player.id, kind, name: player.name })
  return true
}

function popFlash(match, pos) {
  for (const p of match.state.players) {
    if (!p.alive) continue
    const eye = eyeOf(p)
    const to = { x: pos.x - eye.x, y: pos.y - eye.y, z: pos.z - eye.z }
    const dist = Math.hypot(to.x, to.y, to.z) || 0.001
    if (dist < 0.4) {
      p.flash = 1
      continue
    }
    if (dist > 24) continue
    const dir = { x: to.x / dist, y: to.y / dist, z: to.z / dist }
    const look = dirFromAngles(p.lookYaw, p.lookPitch)
    const dot = look.x * dir.x + look.y * dir.y + look.z * dir.z
    const wall = match.physics.raycast(eye, dir, dist)
    const blocked = wall && wall.t < dist - 0.4
    const facing = Math.max(0, (dot + 0.2) / 1.2)
    let intensity = (1 - dist / 24) * (0.15 + 0.85 * facing * facing)
    if (blocked) intensity *= 0.08
    p.flash = Math.min(1, p.flash + intensity)
  }
  match.state.events.push({ type: 'flash', pos: { ...pos } })
}

function boom(match, pos, ownerId) {
  clearSmokeRadius(match.state.smokes, pos, 4.2)
  const owner = match.state.players.find((p) => p.id === ownerId) || null
  for (const p of match.state.players) {
    if (!p.alive) continue
    const d = dist3({ ...p.pos, y: p.pos.y + 1 }, pos)
    if (d > 7) continue
    const eye = eyeOf(p)
    const dir = normalize({ x: pos.x - eye.x, y: pos.y - eye.y, z: pos.z - eye.z })
    const wall = match.physics.raycast(eye, dir, d)
    const blocked = wall && wall.t < d - 0.35
    let dmg = 98 * (1 - d / 7)
    if (blocked) dmg *= 0.35
    if (owner && p !== owner && p.team === owner.team && !match.state.friendlyFire) dmg = 0
    if (p.armor > 0) dmg *= 0.75
    if (dmg > 1 && match.hurt) match.hurt(p, dmg, owner, 'he', 'chest', false)
  }
  match.state.events.push({ type: 'explode', kind: 'he', pos: { ...pos } })
}

function igniteFire(match, pos, ownerId) {
  clearSmokeRadius(match.state.smokes, pos, 3)
  match.state.fires.push({
    id: `f${match.ids++}`,
    pos: { x: pos.x, y: 0.15, z: pos.z },
    radius: 3.15,
    life: 7,
    owner: ownerId,
    acc: 0
  })
  match.state.events.push({ type: 'explode', kind: 'molotov', pos: { ...pos } })
}

export function detonateGrenade(match, g) {
  g.live = false
  if (g.kind === 'smoke') {
    const cells = igniteSmoke(match.physics.solids, g.pos)
    match.state.smokes.push({ id: `s${match.ids++}`, cells, life: 18, origin: { ...g.pos } })
    match.state.events.push({ type: 'smoke', pos: { ...g.pos } })
  } else if (g.kind === 'flash') popFlash(match, g.pos)
  else if (g.kind === 'molotov') igniteFire(match, g.pos, g.owner)
  else boom(match, g.pos, g.owner)
}

/** @param {object} match @param {number} dt */
export function stepGrenades(match, dt) {
  const solids = match.physics.solids
  for (const g of match.state.grenades) {
    if (!g.live) continue
    g.fuse -= dt
    g.vel.y -= 14 * dt
    const next = {
      x: g.pos.x + g.vel.x * dt,
      y: g.pos.y + g.vel.y * dt,
      z: g.pos.z + g.vel.z * dt
    }
    if (blocked(solids, next)) {
      const axes = ['x', 'y', 'z']
      for (const axis of axes) {
        const trial = { ...g.pos, [axis]: next[axis] }
        if (blocked(solids, trial)) g.vel[axis] *= -0.42
        else g.pos[axis] = next[axis]
      }
      if (g.kind === 'molotov' && g.vel.y < 0) g.fuse = 0
      if (Math.hypot(g.vel.x, g.vel.y, g.vel.z) < 1.4) {
        g.vel.x = 0
        g.vel.z = 0
        g.vel.y = Math.min(0, g.vel.y)
      }
    } else {
      g.pos = next
    }
    if (g.pos.y < 0.12) {
      g.pos.y = 0.12
      if (g.vel.y < 0) g.vel.y *= -0.3
      if (g.kind === 'molotov') g.fuse = 0
    }
    if (g.fuse <= 0) detonateGrenade(match, g)
  }
  match.state.grenades = match.state.grenades.filter((g) => g.live)
}

/** @param {object} match @param {number} dt */
export function stepHazards(match, dt) {
  for (const smoke of match.state.smokes) {
    smoke.life -= dt
    for (const cell of smoke.cells) cell.d -= dt / 18
    smoke.cells = smoke.cells.filter((c) => c.d > 0.08)
  }
  match.state.smokes = match.state.smokes.filter((s) => s.life > 0 && s.cells.length)

  for (const fire of match.state.fires) {
    fire.life -= dt
    fire.acc += dt
    clearSmokeRadius(match.state.smokes, fire.pos, fire.radius * 0.85)
    if (fire.acc >= 0.2) {
      fire.acc = 0
      const owner = match.state.players.find((p) => p.id === fire.owner) || null
      for (const p of match.state.players) {
        if (!p.alive) continue
        const d = Math.hypot(p.pos.x - fire.pos.x, p.pos.z - fire.pos.z)
        if (d < fire.radius && p.pos.y < 1.6) {
          if (match.hurt) match.hurt(p, 5, owner, 'molotov', 'legs', false)
        }
      }
    }
  }
  match.state.fires = match.state.fires.filter((f) => f.life > 0)
}
