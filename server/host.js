import { WebSocketServer } from 'ws'
import { createMatch, stepMatch, applyOrders, buyItem, snapshot } from '../src/sim/match.js'
import { planBots, buildSenses } from '../src/sim/bots.js'
import { TICK } from '../src/sim/constants.js'

const MAX_MSG = 4096
const SLOT_OK = new Set(['primary', 'secondary', 'melee', 'grenade', 'bomb', 'last', 'prev', 'next', null])

/**
 * Keep host memory tiny. Phones may sample look densely, but only this slim packet is stored.
 * @param {any} raw
 */
function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object') return null
  const yaws = Array.isArray(raw.sub?.yaws) ? raw.sub.yaws.slice(0, 8) : []
  const fireU = Array.isArray(raw.sub?.fireU) ? raw.sub.fireU.slice(0, 4) : []
  const slot = SLOT_OK.has(raw.slot) ? raw.slot : null
  return {
    tick: Number(raw.tick) || 0,
    seq: Number(raw.seq) || 0,
    rewind: !!raw.rewind,
    yaw: Number(raw.yaw) || 0,
    pitch: Number(raw.pitch) || 0,
    forward: Math.max(-1, Math.min(1, Number(raw.forward) || 0)),
    side: Math.max(-1, Math.min(1, Number(raw.side) || 0)),
    walk: !!raw.walk,
    crouch: !!raw.crouch,
    jump: !!raw.jump,
    fire: !!raw.fire,
    aim: !!raw.aim,
    reload: !!raw.reload,
    use: !!raw.use,
    drop: !!raw.drop,
    slot,
    sub: {
      yaws: yaws.map((s) => ({
        u: Math.max(0, Math.min(1, Number(s.u) || 0)),
        yaw: Number(s.yaw) || 0,
        pitch: Number(s.pitch) || 0
      })),
      fireU: fireU.map((u) => Math.max(0, Math.min(1, Number(u) || 0))),
      pressU: Number(raw.sub?.pressU ?? 2)
    }
  }
}

/**
 * Authoritative match host. Clients send inputs only.
 * Mobile clients still do rendering, prediction, and dense look sampling locally.
 * @param {{port?: number}} [opts]
 */
export async function startServer(opts = {}) {
  const port = opts.port || 3099
  const match = await createMatch({
    withRapier: true,
    withAI: true,
    winsNeeded: 13,
    halfRounds: 12,
    difficulty: 'normal',
    human: null
  })
  const sockets = new Map()
  const latest = new Map()
  const applied = new Map()
  const memory = {}
  let aiAcc = 0
  let netAcc = 0
  const queuedEvents = []

  const wss = new WebSocketServer({ port })
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      if (raw.length > MAX_MSG) return
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (msg.t === 'join') {
        const team = msg.team === 'T' || msg.team === 'CT' ? msg.team : 'CT'
        const slot = match.state.players.find((p) => p.team === team && p.bot && !sockets.has(p.id))
        if (!slot) {
          ws.send(JSON.stringify({ t: 'error', message: 'That side is full.' }))
          return
        }
        slot.bot = false
        slot.name = String(msg.name || 'Operator').slice(0, 16)
        sockets.set(slot.id, ws)
        ws._pid = slot.id
        ws.send(JSON.stringify({ t: 'welcome', id: slot.id, map: 'de_sector' }))
      } else if (msg.t === 'input' && ws._pid) {
        const clean = sanitizeInput(msg.input)
        if (clean) latest.set(ws._pid, clean)
      } else if (msg.t === 'buy' && ws._pid) {
        buyItem(match, ws._pid, String(msg.item || '').slice(0, 24))
      }
    })
    ws.on('close', () => {
      if (!ws._pid) return
      const player = match.state.players.find((p) => p.id === ws._pid)
      if (player) {
        player.bot = true
        player.name = player.team === 'CT' ? 'Relief' : 'Reserve'
      }
      sockets.delete(ws._pid)
      latest.delete(ws._pid)
    })
  })

  const timer = setInterval(() => {
    aiAcc -= TICK
    if (aiAcc <= 0) {
      aiAcc = 0.1
      const senses = buildSenses(match.state, match.physics)
      const orders = planBots(match.state, match.nav, senses, 0.1, memory)
      applyOrders(match, orders)
    }
    const inputs = {}
    for (const [id, input] of latest) {
      const seq = input.seq
      if (applied.get(id) === seq) {
        inputs[id] = { ...input, sub: { ...(input.sub || {}), fireU: [] } }
      } else {
        inputs[id] = input
        applied.set(id, seq)
      }
    }
    stepMatch(match, TICK, inputs)
    queuedEvents.push(...match.state.events)
    netAcc -= TICK
    if (netAcc <= 0) {
      netAcc = 1 / 20
      const snap = snapshot(match)
      snap.t = 'snap'
      snap.events = queuedEvents.splice(0)
      const payload = JSON.stringify(snap)
      for (const ws of sockets.values()) {
        if (ws.readyState === 1) ws.send(payload)
      }
    }
  }, 1000 / 64)

  return {
    port,
    match,
    close() {
      clearInterval(timer)
      wss.close()
    }
  }
}
