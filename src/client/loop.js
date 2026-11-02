import { get } from 'svelte/store'
import { TICK, dirFromAngles, dist2 } from '../sim/constants.js'
import { MAP, inBuyZone, siteAt } from '../sim/map.js'
import { activeEntry, activeWeapon } from '../sim/weapons.js'
import {
  applyOrders,
  buyItem,
  createMatch,
  stepMatch
} from '../sim/match.js'
import { buildSenses, planBots } from '../sim/bots.js'
import { buildNav } from '../sim/nav.js'
import { eyeOf } from '../physics/hitreg.js'
import { smokeFactor } from '../sim/grenades.js'
import { createPhysics, attachRapier } from '../physics/world.js'
import { createEngine } from './engine.js'
import { createView } from './view.js'
import { createInput } from './input.js'
import { createAudio } from './audio.js'
import { bvhRay } from './renderer/bvh.js'
import { api, bootText, diag, screen, settings, snap } from '../ui/store.js'
import { connect } from '../network/connection.js'
import { createInterpBuffer } from '../network/interpolation.js'
import { createPredictor } from '../network/prediction.js'
import { PLANT_TIME, DEFUSE_TIME, DEFUSE_KIT_TIME } from '../sim/constants.js'

let engine
let view
let input
let audio
let sharedNav = null
let mode = 'menu'
let match = null
let raf = 0
let simClock = 0
let acc = 0
let aiAcc = 0
let fps = 0
let fpsStamp = 0
let fpsFrames = 0
let hitUntil = 0
let hitHead = false
let buyRound = -1
let worker = null
let workerReady = false
let localMemory = {}
let mp = null

function weaponIdOf(player) {
  if (player.slot === 'bomb') return 'c4'
  if (player.slot === 'grenade') return player.loadout.grenades[player.nadeIndex] || 'smoke'
  return activeWeapon(player).id
}

function frameFromState(state, localId) {
  return {
    localId,
    time: state.time,
    players: state.players.map((p) => ({ ...p, weapon: p.weapon || weaponIdOf(p) })),
    bomb: state.bomb,
    grenades: state.grenades,
    pickups: state.pickups,
    smokes: state.smokes,
    fires: state.fires
  }
}

function visibleEnemy(state, physics, viewer, other) {
  if (!other.alive || other.team === viewer.team) return other.team === viewer.team && other.alive
  if (state.time - (other.lastShot || -10) < 0.45) return true
  const a = eyeOf(viewer)
  const b = eyeOf(other)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  const dist = Math.hypot(dx, dy, dz)
  if (dist > 50) return false
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist }
  const look = dirFromAngles(viewer.lookYaw + (viewer.punchYaw || 0), viewer.lookPitch + (viewer.punchPitch || 0))
  const dot = look.x * dir.x + look.y * dir.y + look.z * dir.z
  if (dot < 0.2 && dist > 4) return false
  if (smokeFactor(state.smokes, a, b) > 0.45) return false
  const wall = physics.raycast(a, dir, dist)
  return !(wall && wall.t < dist - 0.45)
}

function publish(frame, extra) {
  const local = frame.players.find((p) => p.id === frame.localId)
  if (!local) return
  const entry = local.loadout ? activeEntry(local) : null
  const weapon = local.loadout ? activeWeapon(local) : { name: local.weapon, id: local.weapon }
  const spread = local.loadout ? Math.hypot(local.vel.x, local.vel.z) * 0.01 + (local.grounded ? 0 : 0.04) : extra.spread || 0
  let prompt = ''
  let progress = 0
  if (local.alive && frame.bomb) {
    if (local.team === 'T' && local.loadout?.bomb && siteAt(local.pos) && frame.phase === 'live') prompt = 'HOLD E TO PLANT'
    if (local.team === 'CT' && frame.bomb.state === 'planted' && dist2(local.pos, frame.bomb.pos) < 1.8) prompt = local.kit ? 'HOLD E TO DEFUSE' : 'HOLD E TO DEFUSE — NO KIT'
    if (local.planting > 0) progress = Math.min(1, local.planting / PLANT_TIME)
    if (local.defusing > 0) progress = Math.min(1, local.defusing / (local.kit ? DEFUSE_KIT_TIME : DEFUSE_TIME))
  }
  const hurtAngle = local.hurtDir ? Math.atan2(local.hurtDir.x, local.hurtDir.z) - local.lookYaw : 0
  const radar = []
  if (match && mode === 'local') {
    for (const p of match.state.players) {
      if (p === local || p.team === local.team || visibleEnemy(match.state, match.physics, local, p)) {
        radar.push({ x: p.pos.x, z: p.pos.z, yaw: p.lookYaw, team: p.team, alive: p.alive, self: p === local })
      }
    }
  } else {
    for (const p of frame.players) {
      if (p.team === local.team || p.id === local.id) {
        radar.push({ x: p.pos.x, z: p.pos.z, yaw: p.lookYaw, team: p.team, alive: p.alive, self: p.id === local.id })
      }
    }
  }
  snap.set({
    hp: local.alive ? local.health : 0,
    armor: local.armor || 0,
    helmet: !!local.helmet,
    money: local.money || 0,
    moneyPop: local.moneyPop && frame.time < local.moneyPop.until ? local.moneyPop.amount : 0,
    mag: weapon.id === 'knife' ? '—' : entry ? entry.mag : local.mag ?? 0,
    reserve: weapon.id === 'knife' ? '—' : entry ? entry.reserve : local.reserve ?? 0,
    weapon: weapon.name || String(weapon.id || '').toUpperCase(),
    nades: (local.loadout?.grenades || local.nades || []).join(' · '),
    team: local.team,
    kit: !!local.kit,
    hasBomb: !!(local.loadout?.bomb || local.bomb),
    phase: frame.phase || extra.phase,
    phaseTime: extra.phaseTime,
    bombTimer: frame.bomb?.timer || 0,
    bombState: frame.bomb?.state,
    bomb: frame.bomb,
    score: extra.score,
    round: extra.round,
    rounds: extra.rounds,
    banner: extra.banner,
    bannerLeft: extra.banner ? extra.banner.until - (frame.time || 0) : 0,
    killfeed: extra.killfeed,
    buyOpen: input.isBuyOpen(),
    paused: input.isPaused(),
    locked: input.isLocked(),
    alive: !!local.alive,
    scoped: local.scoped || 0,
    spread,
    hurt: local.hurt || 0,
    hurtAngle,
    hit: performance.now() < hitUntil ? { head: hitHead } : null,
    prompt,
    progress,
    radar,
    labels: view.labels(frame),
    board: frame.players.map((p) => ({
      name: p.name,
      team: p.team,
      bot: p.bot,
      alive: p.alive,
      kills: p.kills || 0,
      deaths: p.deaths || 0,
      assists: p.assists || 0,
      money: p.money || 0,
      ping: p.ping || (p.bot ? 0 : 8)
    })),
    scoreboard: input.scoreboard() || extra.phase === 'gameover',
    gameover: extra.phase === 'gameover',
    winner: extra.winner,
    fps,
    inZone: local.pos ? inBuyZone(local.pos, local.team) : false,
    canBuy: extra.phase === 'buy' && local.alive && local.pos && inBuyZone(local.pos, local.team),
    planting: local.planting || 0,
    defusing: local.defusing || 0,
    touch: input.isTouch(),
    radio: input.getRadio(),
    inspecting: input.getInspecting()
  })
}

function slim(state) {
  return {
    time: state.time,
    phase: state.phase,
    round: state.round,
    pistolRound: state.pistolRound,
    difficulty: state.difficulty,
    bomb: { ...state.bomb, pos: { ...state.bomb.pos } },
    smokes: state.smokes,
    players: state.players.map((p) => ({
      id: p.id,
      team: p.team,
      bot: p.bot,
      frozen: p.frozen,
      alive: p.alive,
      pos: { ...p.pos },
      vel: { ...p.vel },
      lookYaw: p.lookYaw,
      lookPitch: p.lookPitch,
      punchPitch: p.punchPitch,
      height: p.height,
      health: p.health,
      armor: p.armor,
      helmet: p.helmet,
      money: p.money,
      kit: p.kit,
      flash: p.flash,
      grounded: p.grounded,
      role: p.role,
      goalSite: p.goalSite,
      lastShot: p.lastShot,
      didBuyRound: p.didBuyRound,
      slot: p.slot,
      nadeIndex: p.nadeIndex,
      loadout: {
        primary: p.loadout.primary,
        secondary: p.loadout.secondary,
        knife: p.loadout.knife,
        grenades: p.loadout.grenades.slice(),
        bomb: p.loadout.bomb
      }
    }))
  }
}

function thinkBots() {
  if (!match) return
  const senses = buildSenses(match.state, match.physics)
  if (workerReady && worker) {
    worker.postMessage({ type: 'plan', state: slim(match.state), senses, dt: 0.1 })
  } else {
    const orders = planBots(match.state, match.nav, senses, 0.1, localMemory)
    applyOrders(match, orders)
  }
}

function noteHits(events, localId) {
  for (const event of events || []) {
    if (event.type === 'hit' && event.attackerId === localId) {
      hitUntil = performance.now() + 140
      hitHead = !!event.headshot
    }
  }
}

function loop(now) {
  raf = requestAnimationFrame(loop)
  const dt = Math.min(0.05, (now - (loop.last || now)) / 1000)
  loop.last = now
  fpsFrames++
  if (now - fpsStamp > 500) {
    fps = Math.round((fpsFrames * 1000) / (now - fpsStamp))
    fpsFrames = 0
    fpsStamp = now
  }

  if (mode === 'menu' || !match && mode !== 'mp') {
    view.cinematic(now / 1000)
    engine.composer.render()
    return
  }

  if (mode === 'local' && match) {
    acc += dt
    if (acc > TICK * 5) acc = TICK * 5
    aiAcc -= dt
    if (aiAcc <= 0) {
      aiAcc = 0.1
      thinkBots()
    }
    while (acc >= TICK) {
      const t0 = simClock
      const t1 = simClock + TICK * 1000
      const human = input.consume(t0, t1)
      stepMatch(match, TICK, { local: human })
      noteHits(match.state.events, 'local')
      audio.events(match.state.events, 'local')
      view.absorb(match.state.events)
      simClock = t1
      acc -= TICK
    }
    const local = match.state.players.find((p) => p.id === 'local')
    if (match.state.phase === 'buy' && local?.alive && buyRound !== match.state.round && match.state.phaseTime > 16) {
      buyRound = match.state.round
      input.openBuy()
    }
    if (match.state.phase === 'gameover') input.release()
    const frame = frameFromState(match.state, 'local')
    view.update(frame, dt, input.getAngles())
    audio.update(dt, local, match.state.bomb)
    publish(frame, match.state)
  } else if (mode === 'mp' && mp?.latest) {
    const human = input.consume(now - 16, now)
    human.tick = mp.tick
    human.seq = mp.tick
    human.rewind = true
    mp.tick += 1
    // Strip client-only bulk before upload so phones never inflate host memory.
    const wire = {
      tick: human.tick,
      seq: human.seq,
      rewind: true,
      yaw: human.yaw,
      pitch: human.pitch,
      forward: human.forward,
      side: human.side,
      walk: !!human.walk,
      crouch: !!human.crouch,
      jump: !!human.jump,
      fire: !!human.fire,
      aim: !!human.aim,
      reload: !!human.reload,
      use: !!human.use,
      drop: !!human.drop,
      slot: human.slot || null,
      sub: {
        yaws: (human.sub?.yaws || []).slice(0, 8),
        fireU: (human.sub?.fireU || []).slice(0, 4),
        pressU: human.sub?.pressU ?? 2
      }
    }
    mp.link.send({ t: 'input', input: wire })
    mp.predictor.push(human.tick, human)
    const sampled = mp.buffer.sample(0.09)
    const latest = mp.latest
    const ghost = mp.ghost
    const players = (sampled?.players || latest.players).map((p) => {
      if (p.id !== mp.id || !ghost) return { ...p, weapon: p.weapon }
      return {
        ...p,
        pos: ghost.pos,
        vel: ghost.vel,
        lookYaw: ghost.lookYaw,
        lookPitch: ghost.lookPitch,
        height: ghost.height,
        grounded: ghost.grounded
      }
    })
    const frame = {
      localId: mp.id,
      time: latest.time,
      players,
      bomb: latest.bomb,
      grenades: latest.grenades || [],
      pickups: latest.pickups || [],
      smokes: latest.smokes || [],
      fires: latest.fires || []
    }
    view.update(frame, dt, input.getAngles())
    const me = players.find((p) => p.id === mp.id)
    audio.update(dt, me, latest.bomb)
    publish(frame, latest)
  }

  engine.composer.render()
}

export async function boot() {
  bootText.set('Creating renderer')
  engine = createEngine()
  document.body.prepend(engine.renderer.domElement)
  view = createView(engine)
  input = createInput(
    engine.renderer.domElement,
    () => get(settings),
    () => {
      if (mode === 'local' && match) {
        const local = match.state.players.find((p) => p.id === 'local')
        return local?.scoped || 0
      }
      return mp?.latest?.players?.find((p) => p.id === mp.id)?.scoped || 0
    }
  )
  audio = createAudio(() => get(settings).volume)
  engine.renderer.domElement.addEventListener('click', () => audio.unlock())

  bootText.set('Baking navigation mesh')
  sharedNav = buildNav(MAP.solids)
  bootText.set('Checking physics')
  const physics = createPhysics(MAP.solids)
  await attachRapier(physics)
  const origin = { x: -20, y: 1.2, z: -36 }
  const dir = { x: 0, y: 0, z: -1 }
  const aabb = physics.raycastAabb(origin, dir, 30)
  const rapier = physics.raycast(origin, dir, 30)
  const bvh = bvhRay(engine.bvhMesh, origin, dir, 30)
  diag.set({
    nav: `${sharedNav.nodes.length} nodes`,
    physics: physics.backend === 'rapier' && aabb && rapier && Math.abs(aabb.t - rapier.t) < 0.2 ? 'rapier synced' : physics.backend,
    bvh: bvh && aabb && Math.abs(bvh.distance - aabb.t) < 0.35 ? 'mesh synced' : 'visual only'
  })

  try {
    worker = new Worker(new URL('../workers/botAI.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      if (event.data.type === 'ready') {
        workerReady = true
        return
      }
      if (event.data.type === 'orders' && match && mode === 'local') applyOrders(match, event.data.orders)
    }
    worker.postMessage({ type: 'nav', nav: sharedNav })
  } catch {
    worker = null
  }

  api.startLocal = startLocal
  api.startMulti = startMulti
  api.quit = quit
  api.buy = (item) => {
    if (mode === 'local' && match) buyItem(match, 'local', item)
    if (mode === 'mp' && mp) mp.link.send({ t: 'buy', item })
  }
  api.resume = () => input.resume()
  api.closeBuy = () => input.closeBuy()
  api.toggleBuy = () => input.toggleBuy()
  api.touchMove = (forward, side) => input.setTouchMove(forward, side)
  api.touchLook = (dx, dy) => input.setTouchLook(dx, dy)
  api.touchAction = (name, down, value) => input.setTouchAction(name, down, value)

  screen.set('menu')
  raf = requestAnimationFrame(loop)
}

async function startLocal(opts) {
  audio.unlock()
  screen.set('loading')
  bootText.set('Spawning sector')
  // Graphics and bot AI stay on this device. The optional match server never sees quality.
  engine.applyQuality(opts.quality || 'auto')
  const team = opts.team === 'random' ? (Math.random() < 0.5 ? 'CT' : 'T') : opts.team
  const full = opts.rounds === 'full'
  match = await createMatch({
    nav: sharedNav,
    withRapier: true,
    withAI: true,
    difficulty: opts.difficulty || 'normal',
    winsNeeded: full ? 13 : 5,
    halfRounds: full ? 12 : 4,
    human: { name: opts.name || 'Operator', team }
  })
  const local = match.state.players.find((p) => p.id === 'local')
  input.setAngles(local.lookYaw, local.lookPitch)
  input.setPlaying(true)
  view.setSkin(opts.skin || 'standard')
  mode = 'local'
  acc = 0
  aiAcc = 0
  simClock = performance.now()
  buyRound = -1
  localMemory = {}
  screen.set('playing')
}

function startMulti(opts) {
  audio.unlock()
  screen.set('loading')
  bootText.set('Connecting')
  // Phone still owns rendering, prediction, and look sampling. Host only gets thin inputs.
  engine.applyQuality(opts.quality || 'auto')
  const team = opts.team === 'random' ? (Math.random() < 0.5 ? 'CT' : 'T') : opts.team
  const link = connect(opts.server || 'ws://localhost:3099')
  mp = { link, id: null, latest: null, buffer: createInterpBuffer(), predictor: createPredictor(), ghost: null, tick: 1 }
  link.socket.addEventListener('error', () => {
    bootText.set('Could not reach the match server')
    screen.set('menu')
  })
  link.on('error', (msg) => {
    bootText.set(msg.message || 'Connection refused')
    screen.set('menu')
  })
  link.on('welcome', (msg) => {
    mp.id = msg.id
    input.setPlaying(true)
    view.setSkin(opts.skin || 'standard')
    mode = 'mp'
    screen.set('playing')
  })
  link.on('snap', (msg) => {
    mp.latest = msg
    mp.buffer.push(msg)
    const me = msg.players.find((p) => p.id === mp.id)
    if (me) mp.ghost = mp.predictor.reconcile(me, msg.tick)
    noteHits(msg.events, mp.id)
    audio.events(msg.events, mp.id)
    view.absorb(msg.events)
  })
  link.socket.addEventListener('open', () => {
    link.send({ t: 'join', name: opts.name || 'Operator', team })
  })
}

function quit() {
  mode = 'menu'
  match = null
  if (mp) {
    mp.link.close()
    mp = null
  }
  input.setPlaying(false)
  screen.set('menu')
  snap.set(null)
}
