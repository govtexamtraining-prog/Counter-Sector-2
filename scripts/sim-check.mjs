import { MAP } from '../src/sim/map.js'
import { buildNav, findPath } from '../src/sim/nav.js'
import { createMatch, stepMatch, fireShot, teleport, giveBomb, buyItem } from '../src/sim/match.js'
import { eyeOf, headOf } from '../src/physics/hitreg.js'
import { anglesFromDir } from '../src/sim/constants.js'
import { planBots, buildSenses } from '../src/sim/bots.js'
import { applyOrders } from '../src/sim/match.js'
import { igniteSmoke, smokeFactor, carveSmoke } from '../src/sim/grenades.js'
import { detonateGrenade } from '../src/sim/grenades.js'
import { fullClip } from '../src/sim/weapons.js'
import { TICK } from '../src/sim/constants.js'

const failures = []
function check(name, cond, detail = '') {
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
  else console.log(`  ok  ${name}`)
}

function aimAt(player, point) {
  const eye = eyeOf(player)
  const dir = {
    x: point.x - eye.x,
    y: point.y - eye.y,
    z: point.z - eye.z
  }
  const ang = anglesFromDir(dir)
  player.lookYaw = ang.yaw
  player.lookPitch = ang.pitch
  return ang
}

const steps = (match, n, inputs) => {
  for (let i = 0; i < n; i++) stepMatch(match, TICK, inputs || {})
}

const nav = buildNav(MAP.solids)
console.log(`nav nodes ${nav.nodes.length}`)
check('nav has nodes', nav.nodes.length > 200, String(nav.nodes.length))
const tSpawn = { x: 0, y: 0.05, z: 34 }
const siteA = { x: -21, y: 0.05, z: -23 }
const siteB = { x: 21, y: 0.05, z: -21 }
const ctSpawn = { x: 0, y: 0.05, z: -36 }
const pathA = findPath(nav, tSpawn, siteA)
const pathB = findPath(nav, tSpawn, siteB)
const pathCT = findPath(nav, tSpawn, ctSpawn)
check('path T to A', pathA.length > 4, `len ${pathA.length}`)
check('path T to B', pathB.length > 4, `len ${pathB.length}`)
check('path T to CT', pathCT.length > 4, `len ${pathCT.length}`)

const match = await createMatch({
  withRapier: true,
  withAI: false,
  winsNeeded: 5,
  halfRounds: 4,
  roster: [
    { id: 'local', name: 'Op', team: 'CT', bot: false },
    { id: 'ally', name: 'Sable', team: 'CT', bot: true, frozen: true },
    { id: 'dummy', name: 'Dummy', team: 'T', bot: true, frozen: true },
    { id: 't2', name: 'Pylon', team: 'T', bot: true, frozen: true }
  ]
})

check('physics backend', match.physics.backend === 'rapier' || match.physics.backend === 'aabb', match.physics.backend)
const rayOrigin = { x: -20, y: 1.2, z: -36 }
const rayDir = { x: 0, y: 0, z: -1 }
const aabbHit = match.physics.raycastAabb(rayOrigin, rayDir, 30)
check('aabb wall ray', aabbHit && Math.abs(aabbHit.t - 4) < 0.25, aabbHit ? aabbHit.t.toFixed(3) : 'miss')
if (match.physics.backend === 'rapier') {
  const rhit = match.physics.raycast(rayOrigin, rayDir, 30)
  check('rapier agrees with aabb', rhit && Math.abs(rhit.t - aabbHit.t) < 0.2, rhit ? rhit.t.toFixed(3) : 'miss')
}

const op = match.state.players.find((p) => p.id === 'local')
const dummy = match.state.players.find((p) => p.id === 'dummy')
check('spawn not NaN', Number.isFinite(op.pos.x) && op.pos.y < 0.4 && op.pos.y > -0.05, JSON.stringify(op.pos))
check('buy zone', op.pos.z < -30)
match.state.phaseTime = 16

const bought = buyItem(match, 'local', 'deagle')
check('buy deagle', bought.ok === true, bought.reason || '')
check('money after deagle', op.money === 100)
const poor = buyItem(match, 'local', 'ak47')
check('cannot afford ak', poor.ok === false)

// Movement and counter-strafe friction: run toward +Z (CT faces +Z, yaw 0 is +Z... CT spawn yaw is 0 which looks +Z toward T? 
// CT yaw 0 looks +Z, but T is at +Z from CT spawn z=-36, yes +Z goes toward mid. Wall is -Z.
op.lookYaw = 0
const z0 = op.pos.z
steps(match, 64, { local: { yaw: 0, pitch: 0, forward: 1, fire: false, crouch: false, jump: false, side: 0, walk: false, use: false, aim: false, reload: false } })
check('run forward', op.pos.z > z0 + 2.2, `dz ${(op.pos.z - z0).toFixed(2)}`)

op.lookYaw = Math.PI
const zWall = op.pos.z
teleport(match, 'local', { x: op.pos.x, y: 0.05, z: -37.2 }, Math.PI)
steps(match, 80, { local: { yaw: Math.PI, pitch: 0, forward: 1, fire: false, crouch: false, jump: false, side: 0, walk: false, use: false, aim: false, reload: false } })
check('blocked by CT wall', op.pos.z > -39.7, op.pos.z.toFixed(3))
void zWall

teleport(match, 'local', { x: 0, y: 0.05, z: -34 }, 0)
op.grounded = true
op.vel.y = 0
steps(match, 20, { local: { yaw: 0, pitch: 0, forward: 0, jump: true, fire: false, crouch: false, side: 0, walk: false, use: false, aim: false, reload: false } })
check('jump leaves ground', op.pos.y > 0.45, op.pos.y.toFixed(2))
steps(match, 70, { local: { yaw: 0, pitch: 0, forward: 0, jump: false, fire: false, crouch: false, side: 0, walk: false, use: false, aim: false, reload: false } })
check('lands', op.grounded && op.pos.y < 0.25, `y ${op.pos.y.toFixed(3)} g ${op.grounded}`)

// Crouch vent
teleport(match, 'local', { x: -12.8, y: 0.05, z: 7 }, Math.PI / 2)
op.height = 1.76
steps(match, 100, { local: { yaw: Math.PI / 2, pitch: 0, forward: 1, crouch: false, jump: false, fire: false, side: 0, walk: false, use: false, aim: false, reload: false } })
check('stand cannot enter vent', op.pos.x < -11.05, op.pos.x.toFixed(2))

teleport(match, 'local', { x: -12.8, y: 0.05, z: 7 }, Math.PI / 2)
op.height = 1.22
steps(match, 220, { local: { yaw: Math.PI / 2, pitch: 0, forward: 1, crouch: true, jump: false, fire: false, side: 0, walk: false, use: false, aim: false, reload: false } })
check('crouch passes vent', op.pos.x > -9.6, op.pos.x.toFixed(2))

teleport(match, 'local', { x: -10.5, y: 0.05, z: 7 }, 0)
op.height = 1.22
steps(match, 40, { local: { yaw: 0, pitch: 0, forward: 0, crouch: false, jump: false, fire: false, side: 0, walk: false, use: false, aim: false, reload: false } })
check('cannot uncrouch in vent', op.height < 1.45, op.height.toFixed(2))

// Live combat
match.state.phase = 'live'
match.state.phaseTime = 80
teleport(match, 'local', { x: -26, y: 0.05, z: -18 }, Math.PI)
teleport(match, 'dummy', { x: -26, y: 0.05, z: -23 }, 0)
dummy.health = 100
dummy.armor = 0
dummy.helmet = false
dummy.alive = true
op.loadout.primary = fullClip('ak47')
op.slot = 'primary'
op.nextFire = 0
op.vel.x = op.vel.z = 0
op.grounded = true
const head = headOf(dummy)
aimAt(op, head)
const before = dummy.health
fireShot(match, 'local', { perfect: true })
check('ak headshot kills unarmored', dummy.health <= 0 || dummy.alive === false, `hp ${dummy.health}`)

dummy.alive = true
dummy.health = 100
dummy.helmet = true
dummy.armor = 100
teleport(match, 'dummy', { x: -26, y: 0.05, z: -23 }, 0)
op.loadout.primary = fullClip('m4a1')
op.slot = 'primary'
op.nextFire = 0
op.punchYaw = 0
op.punchPitch = 0
aimAt(op, headOf(dummy))
fireShot(match, 'local', { perfect: true })
check('m4 helmet headshot is not lethal', dummy.alive && dummy.health > 0 && dummy.health < 40, `hp ${dummy.health.toFixed(1)}`)

dummy.health = 100
dummy.armor = 100
dummy.helmet = true
dummy.alive = true
op.loadout.primary = fullClip('ak47')
op.nextFire = 0
aimAt(op, { x: dummy.pos.x, y: dummy.pos.y + 1.05, z: dummy.pos.z })
fireShot(match, 'local', { perfect: true })
check('armor reduces chest damage', dummy.health > 50 && dummy.health < 90, `hp ${dummy.health.toFixed(1)}`)
void before

// Wall blocks damage
dummy.health = 100
dummy.alive = true
dummy.armor = 0
teleport(match, 'local', { x: -13.2, y: 0.05, z: 0 }, Math.PI / 2)
teleport(match, 'dummy', { x: -8.2, y: 0.05, z: 0 }, 0)
op.nextFire = 0
aimAt(op, headOf(dummy))
fireShot(match, 'local', { perfect: true })
check('wall blocks shot', dummy.health === 100, `hp ${dummy.health}`)

// Sub-tick: end-of-tick yaw faces away, the click happens while still aimed
teleport(match, 'local', { x: -26, y: 0.05, z: -20.2 }, 0)
teleport(match, 'dummy', { x: -26, y: 0.05, z: -22.4 }, 0)
dummy.health = 100
dummy.armor = 0
dummy.helmet = false
dummy.alive = true
op.loadout.primary = fullClip('ak47')
op.slot = 'primary'
op.nextFire = 0
op.punchPitch = 0
op.punchYaw = 0
const aimed = aimAt(op, headOf(dummy))
match.state.phase = 'live'
const away = 0
stepMatch(match, TICK, {
  local: {
    yaw: away,
    pitch: 0,
    forward: 0,
    side: 0,
    fire: true,
    crouch: false,
    jump: false,
    walk: false,
    use: false,
    aim: false,
    reload: false,
    sub: {
      pressU: 0.01,
      fireU: [0.01],
      yaws: [
        { u: 0, yaw: aimed.yaw, pitch: aimed.pitch },
        { u: 1, yaw: away, pitch: 0 }
      ],
      keys: [{ u: 0, forward: 0, side: 0, fire: true, crouch: false, jump: false, walk: false, use: false, aim: false, reload: false }]
    }
  }
})
check('sub-tick shot uses click angle', dummy.health < 100, `hp ${dummy.health.toFixed(1)} yaw now ${op.lookYaw.toFixed(2)}`)

// Rewind. Record both pawns, then move only the target.
teleport(match, 'local', { x: -2, y: 0.05, z: 8 }, Math.PI)
teleport(match, 'dummy', { x: -2, y: 0.05, z: 4 }, 0)
dummy.health = 100
dummy.alive = true
dummy.armor = 0
dummy.helmet = false
steps(match, 2, {})
const oldPos = { x: dummy.pos.x, y: dummy.pos.y, z: dummy.pos.z }
const rewindTick = match.state.tick
teleport(match, 'dummy', { x: 8, y: 0.05, z: 4 }, 0)
op.nextFire = 0
op.punchPitch = 0
op.punchYaw = 0
const oldHead = { x: oldPos.x, y: oldPos.y + dummy.height - 0.15, z: oldPos.z }
aimAt(op, oldHead)
fireShot(match, 'local', { perfect: true, rewindTick })
check('lag compensation rewind hits old pose', dummy.health < 100, `hp ${dummy.health.toFixed(1)}`)

dummy.health = 100
dummy.alive = true
op.nextFire = 0
fireShot(match, 'local', { perfect: true })
check('current pose is a miss', dummy.health === 100, `hp ${dummy.health}`)

// Smoke voxels block vision and bullets carve them
const smokeCells = igniteSmoke(match.physics.solids, { x: 0, y: 1.2, z: 0 })
match.state.smokes.push({ id: 's-test', cells: smokeCells, life: 18, origin: { x: 0, y: 1.2, z: 0 } })
const a = { x: 0, y: 1.2, z: -2 }
const b = { x: 0, y: 1.2, z: 2 }
const beforeSmoke = smokeFactor(match.state.smokes, a, b)
check('smoke blocks line', beforeSmoke > 0.4, beforeSmoke.toFixed(2))
const density = () => match.state.smokes.reduce((sum, sm) => sum + sm.cells.reduce((s2, c) => s2 + c.d, 0), 0)
const denseBefore = density()
carveSmoke(match.state.smokes, a, b, 0.4)
const denseAfter = density()
check('bullets carve smoke', denseAfter < denseBefore, `${denseBefore.toFixed(2)} -> ${denseAfter.toFixed(2)}`)

// Flash
teleport(match, 'local', { x: 0, y: 0.05, z: -6 }, 0)
op.lookYaw = 0
op.lookPitch = 0
op.flash = 0
detonateGrenade(match, { kind: 'flash', pos: { x: 0, y: 1.4, z: -3 }, live: true, owner: 't2' })
check('flashbang blinds', op.flash > 0.45, op.flash.toFixed(2))

// HE
op.health = 100
op.alive = true
op.armor = 0
match.state.phase = 'live'
detonateGrenade(match, { kind: 'he', pos: { x: op.pos.x, y: 1, z: op.pos.z + 0.4 }, live: true, owner: 'dummy' })
check('HE damages', op.health < 80, `hp ${op.health.toFixed(1)}`)

// Molotov
op.health = 100
detonateGrenade(match, { kind: 'molotov', pos: { x: op.pos.x, y: 0.2, z: op.pos.z }, live: true, owner: 'dummy' })
steps(match, 20, {})
check('molotov burns', op.health < 100, `hp ${op.health.toFixed(1)}`)

// Bomb plant / explode / economy
match.state.phase = 'live'
match.state.bomb.timer = 40
op.health = 100
op.alive = true
op.team = 'T'
giveBomb(match, 'local')
teleport(match, 'local', { x: -26, y: 0.05, z: -22 }, 0)
op.vel.x = 0
op.vel.z = 0
op.grounded = true
op.hurt = 0
const scoreT = match.state.score.T
steps(match, Math.ceil(3.4 / TICK), {
  local: { yaw: 0, pitch: 0, forward: 0, side: 0, fire: false, crouch: true, jump: false, walk: false, use: true, aim: false, reload: false }
})
check('bomb plants', match.state.bomb.state === 'planted', match.state.bomb.state)
match.state.bomb.timer = 0.02
steps(match, 4, {})
check('bomb explodes into T win', match.state.score.T === scoreT + 1, `score ${match.state.score.T}`)

// Defuse
const match2 = await createMatch({
  withRapier: false,
  withAI: true,
  winsNeeded: 5,
  halfRounds: 4,
  difficulty: 'normal',
  roster: [
    { id: 'local', name: 'Op', team: 'CT', bot: false },
    { id: 'dummy', name: 'Dummy', team: 'T', bot: true, frozen: true }
  ]
})
match2.state.phase = 'live'
const ct = match2.state.players.find((p) => p.id === 'local')
ct.kit = true
giveBomb(match2, 'dummy')
const t = match2.state.players.find((p) => p.id === 'dummy')
teleport(match2, 'dummy', { x: 20, y: 0.05, z: -21 }, Math.PI)
t.loadout.bomb = true
match2.state.bomb.state = 'carried'
match2.state.bomb.carrier = 'dummy'
// force plant by short-circuit: set planted
match2.state.bomb.state = 'planted'
match2.state.bomb.pos = { x: 20, y: 0.2, z: -21 }
match2.state.bomb.timer = 30
match2.state.bomb.site = 'B'
teleport(match2, 'local', { x: 20, y: 0.05, z: -21.2 }, 0)
ct.hurt = 0
ct.grounded = true
steps(match2, Math.ceil(5.2 / TICK), {
  local: { yaw: 0, pitch: 0, forward: 0, side: 0, use: true, fire: false, crouch: true, jump: false, walk: false, aim: false, reload: false }
})
check('kit defuse', match2.state.bomb.state === 'defused' || match2.state.score.CT === 1, match2.state.bomb.state)

// Bots path and shoot intention
const memory = {}
const senses = buildSenses(match2.state, match2.physics)
const orders = planBots(match2.state, match2.nav, senses, 0.1, memory)
check('bot planner returns orders or skips frozen', true)
applyOrders(match2, orders)

// Loss bonus numbers
const { lossBonus } = await import('../src/sim/economy.js')
check('loss bonus curve', lossBonus(1) === 1400 && lossBonus(5) === 3400, `${lossBonus(1)} ${lossBonus(5)}`)

if (failures.length) {
  console.error(`\n${failures.length} failed`)
  for (const f of failures) console.error('  FAIL', f)
  process.exit(1)
}
console.log('\nAll simulation checks passed')
