/**
 * WebAudio bed: shots, impacts, bomb beeps, UI ticks. No external files.
 */
export function createAudio(getVolume) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  let ctx = null
  let master = null
  let bombTimer = 0
  let stepTimer = 0
  let heartTimer = 0

  function ensure() {
    if (ctx) return
    ctx = new AudioCtx()
    master = ctx.createGain()
    master.connect(ctx.destination)
  }

  function gain() {
    if (!master) return
    master.gain.value = Math.max(0, Math.min(1, getVolume() ?? 0.8))
  }

  function tone(freq, dur, type, vol, slide = 0) {
    if (!ctx) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g)
    g.connect(master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  function noise(dur, vol, hp = 400) {
    if (!ctx) return
    const t = ctx.currentTime
    const length = Math.floor(ctx.sampleRate * dur)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = hp
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filter)
    filter.connect(g)
    g.connect(master)
    src.start(t)
  }

  function shot(id) {
    ensure()
    gain()
    if (id === 'knife') {
      noise(0.12, 0.2, 900)
      return
    }
    if (id === 'awp') {
      noise(0.18, 0.55, 120)
      tone(140, 0.22, 'sawtooth', 0.2, -80)
      return
    }
    if (id === 'deagle') {
      noise(0.12, 0.4, 180)
      tone(180, 0.12, 'square', 0.12, -60)
      return
    }
    noise(0.07, id === 'nova' ? 0.45 : 0.32, 250)
    tone(id === 'm4a1' || id === 'mp9' ? 420 : 240, 0.06, 'square', 0.05, -100)
  }

  return {
    unlock() {
      ensure()
      if (ctx.state === 'suspended') ctx.resume()
      gain()
    },
    events(list, localId) {
      if (!list || !ctx) return
      for (const event of list) {
        if (event.type === 'shot' && event.id === localId) shot(event.weapon)
        else if (event.type === 'shot') {
          noise(0.05, 0.12, 300)
        }
        if (event.type === 'hit' && event.attackerId === localId) {
          if (event.headshot) tone(1800, 0.08, 'sine', 0.18)
          else tone(520, 0.05, 'triangle', 0.08)
        }
        if (event.type === 'kill' && event.killerId === localId) tone(880, 0.12, 'sine', 0.12, 200)
        if (event.type === 'dry') tone(180, 0.04, 'square', 0.08)
        if (event.type === 'plant' || event.type === 'defuse') tone(660, 0.2, 'square', 0.1)
        if (event.type === 'explode') noise(0.4, event.kind === 'bomb' ? 0.7 : 0.35, 80)
        if (event.type === 'flash') noise(0.2, 0.15, 2000)
        if (event.type === 'round') tone(event.winner === 'CT' ? 520 : 340, 0.25, 'sawtooth', 0.08)
      }
    },
    update(dt, player, bomb) {
      if (!ctx || !player) return
      gain()
      const speed = Math.hypot(player.vel?.x || 0, player.vel?.z || 0)
      if (player.alive && player.grounded && speed > 2.2) {
        stepTimer -= dt
        const interval = player.crouch || speed < 3.2 ? 0.52 : 0.34
        if (stepTimer <= 0) {
          stepTimer = interval
          noise(0.05, speed > 4 ? 0.12 : 0.06, 180)
        }
      }
      if (player.alive && player.health < 28) {
        heartTimer -= dt
        if (heartTimer <= 0) {
          heartTimer = 0.7
          tone(70, 0.12, 'sine', 0.12)
        }
      }
      if (bomb?.state === 'planted') {
        bombTimer -= dt
        const gap = Math.max(0.12, (bomb.timer || 1) / 28)
        if (bombTimer <= 0) {
          bombTimer = gap
          tone(880, 0.06, 'square', 0.14)
        }
      }
    }
  }
}
