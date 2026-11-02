import { clamp } from '../sim/constants.js'

const SLOT_KEYS = {
  Digit1: 'primary',
  Digit2: 'secondary',
  Digit3: 'melee',
  Digit4: 'grenade',
  Digit5: 'bomb',
  Numpad1: 'primary',
  Numpad2: 'secondary',
  Numpad3: 'melee',
  Numpad4: 'grenade',
  Numpad5: 'bomb',
  KeyQ: 'last'
}

const WALK_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight'])
const CROUCH_KEYS = new Set(['ControlLeft', 'ControlRight', 'KeyC'])
const JUMP_KEYS = new Set(['Space'])
const RELOAD_KEYS = new Set(['KeyR'])
const USE_KEYS = new Set(['KeyE'])
const DROP_KEYS = new Set(['KeyG'])
const BUY_KEYS = new Set(['KeyB'])
const SCORE_KEYS = new Set(['Tab', 'KeyM'])
const PAUSE_KEYS = new Set(['Escape'])
const INSPECT_KEYS = new Set(['KeyF'])
const RADIO_KEYS = {
  KeyZ: 'Radio · Affirmative',
  KeyX: 'Radio · Negative',
  KeyV: 'Radio · Enemy spotted',
  KeyT: 'Radio · Taking fire',
  KeyY: 'Radio · Nice shot',
  Comma: 'Radio · Hold this position',
  Period: 'Radio · Follow me',
  KeyH: 'Radio · Hold positions',
  KeyJ: 'Radio · Stick together',
  KeyK: 'Radio · Go go go',
  KeyL: 'Radio · Fall back',
  KeyU: 'Radio · Cover me',
  KeyI: 'Radio · In position',
  KeyO: 'Radio · Report in',
  KeyP: 'Radio · Regroup'
}

export function isTouchClient() {
  if (typeof window === 'undefined') return false
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints || 0) > 0 ||
    window.matchMedia('(pointer: coarse)').matches
  )
}

/**
 * Pointer lock / keyboard / touch. Heavy look sampling stays on the device.
 * Multiplayer only ever uploads the slim consume() packet.
 */
export function createInput(canvas, getSettings, getScope) {
  const keys = new Set()
  const keyLog = []
  const lookLog = []
  const fireTimes = []
  let yaw = 0
  let pitch = 0
  let fireDown = false
  let aimDown = false
  let buyOpen = false
  let paused = false
  let ignoreUnlock = false
  let playing = false
  let scoreSticky = false
  let walkToggle = false
  let touchMode = isTouchClient()
  let touchEngaged = false
  let touchForward = 0
  let touchSide = 0
  let touchWalk = false
  let touchCrouch = false
  let touchJump = false
  let touchReload = false
  let touchUse = false
  let touchDrop = false
  let touchFire = false
  let touchAim = false
  let touchScore = false
  let pendingSlot = null
  let radio = null
  let inspectUntil = 0

  function applyLook(dx, dy) {
    const scope = getScope()
    const scale = scope === 2 ? 0.22 : scope === 1 ? 0.48 : 1
    const settings = getSettings()
    const base = settings.sensitivity || 0.0022
    const touchMul = touchMode ? settings.touchSensitivity || 1.35 : 1
    const sens = base * scale * touchMul
    yaw += dx * sens
    pitch = clamp(pitch - dy * sens, -1.45, 1.45)
    lookLog.push({ t: performance.now(), yaw, pitch })
  }

  function setRadio(text) {
    radio = { text, until: performance.now() + 2200 }
  }

  const onKey = (event, down) => {
    if (event.repeat) return
    if (
      [
        'Tab',
        'Space',
        'KeyB',
        'Escape',
        'KeyM',
        'Slash',
        'Backquote'
      ].includes(event.code) ||
      event.code.startsWith('Digit') ||
      event.code.startsWith('Numpad')
    ) {
      event.preventDefault()
    }
    if (!playing) return
    if (down) keys.add(event.code)
    else keys.delete(event.code)
    keyLog.push({ t: performance.now(), code: event.code, down })

    if (down && BUY_KEYS.has(event.code)) toggleBuy()
    if (down && PAUSE_KEYS.has(event.code)) {
      if (buyOpen) closeBuy()
      else togglePause()
    }
    if (down && event.code === 'KeyM') scoreSticky = !scoreSticky
    if (down && event.code === 'CapsLock') walkToggle = !walkToggle
    if (down && INSPECT_KEYS.has(event.code)) {
      inspectUntil = performance.now() + 900
      setRadio('Inspect')
    }
    if (down && RADIO_KEYS[event.code]) setRadio(RADIO_KEYS[event.code])
    if (down && (event.code === 'BracketLeft' || event.code === 'PageUp')) pendingSlot = 'prev'
    if (down && (event.code === 'BracketRight' || event.code === 'PageDown')) pendingSlot = 'next'
  }

  const onMouseMove = (event) => {
    if (touchMode) return
    if (document.pointerLockElement !== canvas || paused || buyOpen) return
    applyLook(event.movementX, event.movementY)
  }

  const onMouseDown = (event) => {
    if (!playing || paused || buyOpen) return
    if (touchMode) {
      touchEngaged = true
      return
    }
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock()
      return
    }
    if (event.button === 0) {
      fireDown = true
      fireTimes.push(performance.now())
    }
    if (event.button === 2) aimDown = true
    if (event.button === 3 || event.button === 4) pendingSlot = 'last'
  }

  const onMouseUp = (event) => {
    if (event.button === 0) fireDown = false
    if (event.button === 2) aimDown = false
  }

  const onWheel = (event) => {
    if (!playing || paused || buyOpen) return
    event.preventDefault()
    pendingSlot = event.deltaY > 0 ? 'next' : 'prev'
  }

  function toggleBuy() {
    buyOpen = !buyOpen
    if (buyOpen) {
      ignoreUnlock = true
      if (!touchMode) document.exitPointerLock()
    } else if (!paused && !touchMode) canvas.requestPointerLock()
  }

  function closeBuy() {
    if (!buyOpen) return
    buyOpen = false
    if (!paused && playing && !touchMode) canvas.requestPointerLock()
  }

  function togglePause() {
    paused = !paused
    if (paused) {
      ignoreUnlock = true
      if (!touchMode) document.exitPointerLock()
    } else if (!buyOpen && !touchMode) canvas.requestPointerLock()
  }

  window.addEventListener('keydown', (event) => onKey(event, true))
  window.addEventListener('keyup', (event) => onKey(event, false))
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('contextmenu', (event) => event.preventDefault())
  window.addEventListener('blur', () => {
    keys.clear()
    fireDown = false
    aimDown = false
    touchFire = false
    touchAim = false
    touchJump = false
    touchReload = false
    touchUse = false
    touchDrop = false
    touchForward = 0
    touchSide = 0
  })
  document.addEventListener('pointerlockchange', () => {
    if (touchMode) return
    if (document.pointerLockElement !== canvas && playing && !ignoreUnlock && !buyOpen) paused = true
    ignoreUnlock = false
  })
  canvas.addEventListener('click', () => {
    if (!playing || paused || buyOpen) return
    if (touchMode) {
      touchEngaged = true
      return
    }
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock()
  })

  function axis(codeA, codeB) {
    return (keys.has(codeA) ? 1 : 0) - (keys.has(codeB) ? 1 : 0)
  }

  function held(set) {
    for (const code of set) if (keys.has(code)) return true
    return false
  }

  function resolveSlot(raw) {
    if (!raw) return null
    if (raw === 'prev' || raw === 'next' || raw === 'last') return raw
    return SLOT_KEYS[raw] || raw
  }

  return {
    setPlaying(value) {
      playing = value
      if (!value) {
        paused = false
        buyOpen = false
        scoreSticky = false
        touchEngaged = false
        keys.clear()
        if (!touchMode) document.exitPointerLock()
      } else if (touchMode) {
        touchEngaged = true
      }
    },
    setAngles(nextYaw, nextPitch) {
      yaw = nextYaw
      pitch = nextPitch
    },
    getAngles() {
      return { yaw, pitch }
    },
    isLocked() {
      return touchMode ? playing && touchEngaged && !paused && !buyOpen : document.pointerLockElement === canvas
    },
    isPaused() {
      return paused
    },
    isBuyOpen() {
      return buyOpen
    },
    isTouch() {
      return touchMode
    },
    scoreboard() {
      return held(SCORE_KEYS) || scoreSticky || touchScore
    },
    getRadio() {
      if (!radio) return null
      if (performance.now() > radio.until) {
        radio = null
        return null
      }
      return radio.text
    },
    getInspecting() {
      return performance.now() < inspectUntil
    },
    closeBuy,
    resume() {
      paused = false
      if (playing && !buyOpen) {
        if (touchMode) touchEngaged = true
        else canvas.requestPointerLock()
      }
    },
    openBuy() {
      if (!buyOpen) toggleBuy()
    },
    toggleBuy,
    togglePause,
    release() {
      ignoreUnlock = true
      paused = false
      if (!touchMode) document.exitPointerLock()
    },
    /** Mobile stick: forward/back and strafe in −1…1. Client-only. */
    setTouchMove(forward, side) {
      touchForward = clamp(forward, -1, 1)
      touchSide = clamp(side, -1, 1)
      if (Math.abs(touchForward) > 0.02 || Math.abs(touchSide) > 0.02) touchEngaged = true
    },
    /** Mobile look pad: pixel deltas sampled on device memory. */
    setTouchLook(dx, dy) {
      if (!playing || paused || buyOpen) return
      touchEngaged = true
      applyLook(dx, dy)
    },
    setTouchAction(name, down, value = null) {
      touchEngaged = true
      if (name === 'fire') {
        if (down && !touchFire) fireTimes.push(performance.now())
        touchFire = down
        return
      }
      if (name === 'aim') {
        touchAim = down
        return
      }
      if (name === 'jump') {
        touchJump = down
        return
      }
      if (name === 'crouch') {
        touchCrouch = down
        return
      }
      if (name === 'walk') {
        touchWalk = down
        return
      }
      if (name === 'reload') {
        touchReload = down
        return
      }
      if (name === 'use') {
        touchUse = down
        return
      }
      if (name === 'drop') {
        if (down) touchDrop = true
        return
      }
      if (name === 'score') {
        touchScore = down
        return
      }
      if (name === 'buy' && down) toggleBuy()
      if (name === 'pause' && down) togglePause()
      if (name === 'inspect' && down) {
        inspectUntil = performance.now() + 900
        setRadio('Inspect')
      }
      if (name === 'radio' && down) setRadio('Radio · Need backup')
      if (name === 'slot' && down && value) pendingSlot = value
    },
    pressSlot(slot) {
      pendingSlot = slot
    },
    /**
     * Buttons and look samples for one simulation tick.
     * This packet is the only gameplay traffic sent to a multiplayer host.
     */
    consume(t0, t1) {
      const span = Math.max(1, t1 - t0)
      const unit = (t) => Math.max(0, Math.min(1, (t - t0) / span))
      const yaws = [{ u: 0, yaw, pitch }]
      const keptLook = []
      for (const sample of lookLog) {
        if (sample.t <= t0) continue
        if (sample.t <= t1) yaws.push({ u: unit(sample.t), yaw: sample.yaw, pitch: sample.pitch })
        else keptLook.push(sample)
      }
      lookLog.length = 0
      lookLog.push(...keptLook.slice(-24))
      yaws.push({ u: 1, yaw, pitch })

      const fires = []
      const keptFire = []
      let firstFire = null
      for (const t of fireTimes) {
        if (t <= t0) continue
        if (t <= t1) {
          fires.push(unit(t))
          if (firstFire === null) firstFire = unit(t)
        } else keptFire.push(t)
      }
      fireTimes.length = 0
      fireTimes.push(...keptFire)

      let slot = resolveSlot(pendingSlot)
      pendingSlot = null
      let drop = touchDrop
      touchDrop = false
      const keptKeys = []
      for (const entry of keyLog) {
        if (entry.t <= t0) continue
        if (entry.t > t1) {
          keptKeys.push(entry)
          continue
        }
        if (entry.down && SLOT_KEYS[entry.code]) slot = SLOT_KEYS[entry.code]
        if (entry.down && DROP_KEYS.has(entry.code)) drop = true
      }
      keyLog.length = 0
      keyLog.push(...keptKeys.slice(-32))

      const blocked = paused || buyOpen
      const keyForward = axis('KeyW', 'KeyS') + axis('ArrowUp', 'ArrowDown')
      const keySide = axis('KeyD', 'KeyA') + axis('ArrowRight', 'ArrowLeft')
      let forward = blocked ? 0 : clamp(keyForward + touchForward, -1, 1)
      let side = blocked ? 0 : clamp(keySide + touchSide, -1, 1)
      const firing = !blocked && (fireDown || touchFire)
      return {
        tick: 0,
        yaw,
        pitch,
        forward,
        side,
        walk: !blocked && (held(WALK_KEYS) || walkToggle || touchWalk),
        crouch: !blocked && (held(CROUCH_KEYS) || touchCrouch),
        jump: !blocked && (held(JUMP_KEYS) || touchJump),
        fire: firing,
        aim: !blocked && (aimDown || touchAim),
        reload: !blocked && (held(RELOAD_KEYS) || touchReload),
        use: !blocked && (held(USE_KEYS) || touchUse),
        drop,
        slot,
        sub: {
          yaws: yaws.slice(0, 12),
          fireU: fires.slice(0, 8),
          pressU: firstFire === null ? (firing ? 0 : 2) : firstFire
        }
      }
    }
  }
}
