<script>
  import { onMount } from 'svelte'
  import { api, snap } from './store.js'

  let movePad
  let lookPad
  let moveId = null
  let lookId = null
  let moveOrigin = null
  let lookLast = null

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v))
  }

  function onMoveStart(event) {
    event.preventDefault()
    const t = event.changedTouches[0]
    moveId = t.identifier
    const rect = movePad.getBoundingClientRect()
    moveOrigin = { x: t.clientX, y: t.clientY, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 }
    applyMove(t.clientX, t.clientY)
  }

  function onLookStart(event) {
    event.preventDefault()
    const t = event.changedTouches[0]
    lookId = t.identifier
    lookLast = { x: t.clientX, y: t.clientY }
  }

  function onTouchMove(event) {
    for (const t of event.changedTouches) {
      if (t.identifier === moveId) {
        event.preventDefault()
        applyMove(t.clientX, t.clientY)
      } else if (t.identifier === lookId && lookLast) {
        event.preventDefault()
        api.touchLook(t.clientX - lookLast.x, t.clientY - lookLast.y)
        lookLast = { x: t.clientX, y: t.clientY }
      }
    }
  }

  function applyMove(x, y) {
    if (!moveOrigin) return
    const dx = (x - moveOrigin.cx) / 54
    const dy = (y - moveOrigin.cy) / 54
    const forward = clamp(-dy, -1, 1)
    const side = clamp(dx, -1, 1)
    api.touchMove(forward, side)
  }

  function endTouch(event) {
    for (const t of event.changedTouches) {
      if (t.identifier === moveId) {
        moveId = null
        moveOrigin = null
        api.touchMove(0, 0)
      }
      if (t.identifier === lookId) {
        lookId = null
        lookLast = null
      }
    }
  }

  function hold(name, down, value = null) {
    api.touchAction(name, down, value)
  }

  onMount(() => {
    const move = (e) => onTouchMove(e)
    const end = (e) => endTouch(e)
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)
    return () => {
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
      api.touchMove(0, 0)
    }
  })
</script>

{#if $snap && !$snap.buyOpen && !$snap.paused && !$snap.gameover}
  <div class="mobile-pad pointer-events-none absolute inset-0 z-20 select-none">
    <div
      bind:this={movePad}
      class="pad stick left safe-left"
      on:touchstart={onMoveStart}
    >
      <span>WASD</span>
    </div>

    <div
      bind:this={lookPad}
      class="pad look right safe-right"
      on:touchstart={onLookStart}
    >
      <span>LOOK</span>
    </div>

    <div class="actions right-col safe-right">
      <button class="btn fire" on:touchstart|preventDefault={() => hold('fire', true)} on:touchend|preventDefault={() => hold('fire', false)} on:touchcancel|preventDefault={() => hold('fire', false)}>FIRE</button>
      <button class="btn aim" on:touchstart|preventDefault={() => hold('aim', true)} on:touchend|preventDefault={() => hold('aim', false)} on:touchcancel|preventDefault={() => hold('aim', false)}>AIM</button>
      <button class="btn" on:touchstart|preventDefault={() => hold('jump', true)} on:touchend|preventDefault={() => hold('jump', false)} on:touchcancel|preventDefault={() => hold('jump', false)}>JUMP</button>
      <button class="btn" on:touchstart|preventDefault={() => hold('crouch', true)} on:touchend|preventDefault={() => hold('crouch', false)} on:touchcancel|preventDefault={() => hold('crouch', false)}>DUCK</button>
    </div>

    <div class="utility safe-bottom">
      <button class="btn sm" on:touchstart|preventDefault={() => hold('walk', true)} on:touchend|preventDefault={() => hold('walk', false)}>WALK</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('reload', true)} on:touchend|preventDefault={() => hold('reload', false)}>R</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('use', true)} on:touchend|preventDefault={() => hold('use', false)}>E</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('drop', true)}>G</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('buy', true)}>B</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('score', true)} on:touchend|preventDefault={() => hold('score', false)}>TAB</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('radio', true)}>RADIO</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('inspect', true)}>F</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('pause', true)}>ESC</button>
    </div>

    <div class="slots safe-bottom">
      <button class="btn sm" on:touchstart|preventDefault={() => hold('slot', true, 'primary')}>1</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('slot', true, 'secondary')}>2</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('slot', true, 'melee')}>3</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('slot', true, 'grenade')}>4</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('slot', true, 'bomb')}>5</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('slot', true, 'last')}>Q</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('slot', true, 'prev')}>[</button>
      <button class="btn sm" on:touchstart|preventDefault={() => hold('slot', true, 'next')}>]</button>
    </div>
  </div>
{/if}

<style>
  .mobile-pad {
    touch-action: none;
  }
  .pad {
    pointer-events: auto;
    position: absolute;
    bottom: calc(7.5rem + env(safe-area-inset-bottom, 0px));
    width: 8.5rem;
    height: 8.5rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(0, 0, 0, 0.28);
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.7rem;
    letter-spacing: 0.18em;
  }
  .stick.left {
    left: calc(1rem + env(safe-area-inset-left, 0px));
  }
  .look.right {
    right: calc(1rem + env(safe-area-inset-right, 0px));
    width: 10rem;
    height: 10rem;
  }
  .actions {
    pointer-events: auto;
    position: absolute;
    right: calc(0.75rem + env(safe-area-inset-right, 0px));
    bottom: calc(18.5rem + env(safe-area-inset-bottom, 0px));
    display: grid;
    gap: 0.45rem;
  }
  .utility,
  .slots {
    pointer-events: auto;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.35rem;
    max-width: min(96vw, 34rem);
  }
  .utility {
    bottom: calc(3.6rem + env(safe-area-inset-bottom, 0px));
  }
  .slots {
    bottom: calc(0.7rem + env(safe-area-inset-bottom, 0px));
  }
  .btn {
    pointer-events: auto;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(10, 12, 16, 0.55);
    color: #f0e8d8;
    font-family: Barlow Condensed, sans-serif;
    letter-spacing: 0.12em;
    font-size: 0.78rem;
    padding: 0.55rem 0.7rem;
    min-width: 2.6rem;
    border-radius: 0.35rem;
    -webkit-tap-highlight-color: transparent;
  }
  .btn.sm {
    padding: 0.42rem 0.55rem;
    font-size: 0.7rem;
  }
  .btn.fire {
    background: rgba(196, 74, 48, 0.72);
    min-width: 4.2rem;
  }
  .btn.aim {
    background: rgba(70, 110, 150, 0.72);
    min-width: 4.2rem;
  }
  @media (min-width: 900px) and (pointer: fine) {
    .mobile-pad {
      display: none;
    }
  }
</style>
