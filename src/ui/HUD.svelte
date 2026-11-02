<script>
  import { snap, api, settings } from './store.js'
  import { onMount, afterUpdate } from 'svelte'

  let radar
  let base

  function formatTime(seconds) {
    const t = Math.max(0, Math.ceil(seconds || 0))
    const m = Math.floor(t / 60)
    const r = t % 60
    return `${m}:${r.toString().padStart(2, '0')}`
  }

  function drawBase() {
    const c = document.createElement('canvas')
    c.width = 220
    c.height = 220
    const g = c.getContext('2d')
    g.fillStyle = '#1a1712'
    g.fillRect(0, 0, 220, 220)
    const xOf = (x) => ((x + 34) / 68) * 220
    const zOf = (z) => ((z + 44) / 88) * 220
    g.strokeStyle = '#3a342b'
    g.lineWidth = 2
    g.strokeRect(xOf(-30), zOf(-40), xOf(30) - xOf(-30), zOf(40) - zOf(-40))
    g.fillStyle = 'rgba(90, 140, 90, 0.45)'
    g.fillRect(xOf(-28), zOf(-28), xOf(-14) - xOf(-28), zOf(-18) - zOf(-28))
    g.fillStyle = 'rgba(170, 120, 60, 0.45)'
    g.fillRect(xOf(14), zOf(-26), xOf(28) - xOf(14), zOf(-16) - zOf(-26))
    g.fillStyle = '#d7c7a4'
    g.font = '700 12px Barlow Condensed, sans-serif'
    g.fillText('A', xOf(-22), zOf(-22))
    g.fillText('B', xOf(20), zOf(-20))
    g.fillText('MID', xOf(-2), zOf(2))
    return c
  }

  onMount(() => {
    base = drawBase()
  })

  afterUpdate(() => {
    if (!radar || !base || !$snap) return
    const g = radar.getContext('2d')
    g.clearRect(0, 0, 220, 220)
    g.drawImage(base, 0, 0)
    const xOf = (x) => ((x + 34) / 68) * 220
    const zOf = (z) => ((z + 44) / 88) * 220
    const s = $snap
    if (s.bomb && (s.bomb.state === 'dropped' || s.bomb.state === 'planted')) {
      g.fillStyle = s.bomb.state === 'planted' ? '#ff5a4a' : '#e0b15a'
      g.beginPath()
      g.arc(xOf(s.bomb.pos.x), zOf(s.bomb.pos.z), 4, 0, Math.PI * 2)
      g.fill()
    }
    for (const p of s.radar || []) {
      g.save()
      g.translate(xOf(p.x), zOf(p.z))
      g.fillStyle = p.team === 'CT' ? '#8ec8ea' : '#e0a05a'
      if (!p.alive) g.globalAlpha = 0.35
      g.beginPath()
      g.arc(0, 0, p.self ? 4 : 3, 0, Math.PI * 2)
      g.fill()
      if (p.self) {
        g.rotate(p.yaw)
        g.fillStyle = 'rgba(255,255,255,0.8)'
        g.fillRect(-1, -10, 2, 10)
      }
      g.restore()
    }
  })

  $: s = $snap
  $: gap = s ? Math.min(28, 5 + (s.spread || 0) * 420) : 6
  $: timer = s ? formatTime(s.bombState === 'planted' ? s.bombTimer : s.phaseTime) : '0:00'
  $: low = s && (s.bombState === 'planted' || s.phaseTime < 10)
</script>

{#if s}
  <div class="pointer-events-none absolute inset-0">
    {#if s.scoped}
      <div class="scope {s.scoped === 2 ? 'tight' : ''}"></div>
    {:else if !s.buyOpen && !s.paused}
      <div class="crosshair" style="--gap:{gap}px">
        <i class="dot"></i>
        <i class="u" style="left:-1px;top:calc(-1 * var(--gap) - 8px)"></i>
        <i class="d" style="left:-1px;top:var(--gap)"></i>
        <i class="l" style="top:-1px;left:calc(-1 * var(--gap) - 8px)"></i>
        <i class="r" style="top:-1px;left:var(--gap)"></i>
      </div>
    {/if}

    {#if s.hit}
      <div class="hitmark {s.hit.head ? 'head' : ''}"><i></i><i></i><i></i><i></i></div>
    {/if}
    {#if s.hurt > 0.05}
      <div class="dmg" style="opacity:{Math.min(0.9, s.hurt)};--ang:{s.hurtAngle}rad"></div>
    {/if}

    <canvas
      bind:this={radar}
      width="220"
      height="220"
      class="absolute left-3 top-3 h-24 w-24 border border-white/20 bg-black/40 sm:left-5 sm:top-5 sm:h-[220px] sm:w-[220px]"
    ></canvas>

    <div class="absolute left-1/2 top-3 w-[min(18rem,70vw)] -translate-x-1/2 text-center sm:top-4 sm:w-72">
      <div class="flex justify-center gap-3 font-display text-sm tracking-widest">
        <span class="text-tr">T {s.score.T}</span>
        <span class="text-3xl {low ? 'text-red-400' : 'text-white'}">{timer}</span>
        <span class="text-ct">CT {s.score.CT}</span>
      </div>
      <p class="text-[10px] uppercase tracking-[0.28em] text-white/50">Round {s.round} · {s.phase}</p>
      <div class="mt-1 flex justify-center gap-1">
        {#each s.rounds || [] as r}
          <i class="inline-block h-1.5 w-2 {r.winner === 'T' ? 'bg-tr' : 'bg-ct'}"></i>
        {/each}
      </div>
    </div>

    <div class="absolute right-4 top-4 w-64 space-y-1 text-right text-sm">
      {#each s.killfeed || [] as row}
        <div>
          <span class={row.killerTeam === 'CT' ? 'text-ct' : 'text-tr'}>{row.killer}</span>
          <span class="mx-1 text-white/50">{row.weapon}{row.headshot ? ' HS' : ''}</span>
          <span class={row.victimTeam === 'CT' ? 'text-ct' : 'text-tr'}>{row.victim}</span>
        </div>
      {/each}
    </div>

    {#if s.banner && s.bannerLeft > 0}
      <div class="absolute left-1/2 top-20 w-[min(36rem,92vw)] -translate-x-1/2 text-center sm:top-24">
        <p class="font-display text-3xl tracking-[0.18em] text-white sm:text-5xl">{s.banner.text}</p>
        <p class="mt-1 text-xs tracking-[0.35em] text-sand">{s.banner.sub || ''}</p>
      </div>
    {/if}

    {#if s.radio}
      <p class="absolute left-1/2 top-[46%] -translate-x-1/2 rounded bg-black/55 px-3 py-1 text-xs tracking-[0.22em] text-sand">{s.radio}</p>
    {/if}

    {#if s.prompt}
      <p class="absolute left-1/2 top-[58%] -translate-x-1/2 text-xs tracking-[0.28em] text-sand">{s.prompt}</p>
    {/if}

    {#if s.progress > 0}
      <div class="absolute left-1/2 top-[62%] h-1.5 w-48 -translate-x-1/2 bg-white/20">
        <div class="h-full bg-sand" style="width:{s.progress * 100}%"></div>
      </div>
    {/if}

    {#each s.labels || [] as label}
      <div class="absolute text-center text-[10px] tracking-wide" style="left:{label.x}%;top:{label.y}%;transform:translate(-50%,-120%)">
        <div class="text-ct">{label.name}</div>
        <div class="mx-auto mt-0.5 h-1 w-10 bg-black/50"><i class="block h-full bg-emerald-400" style="width:{label.hp}%"></i></div>
      </div>
    {/each}

    <div class="absolute bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))] left-4 sm:bottom-6 sm:left-6">
      <div class="font-display text-4xl leading-none {s.hp < 30 ? 'text-red-400' : 'text-white'} sm:text-6xl">{Math.ceil(s.hp)}</div>
      <div class="mt-1 text-xs text-white/70 sm:text-sm">{s.helmet ? 'HELMET' : 'ARMOR'} {Math.ceil(s.armor)}</div>
      <div class="mt-1 font-display text-xl text-sand sm:mt-2 sm:text-2xl">${s.money}{#if s.moneyPop}<span class="ml-2 text-emerald-300">+{s.moneyPop}</span>{/if}</div>
      {#if s.hasBomb}<div class="mt-1 text-xs tracking-[0.3em] text-red-300">C4</div>{/if}
    </div>

    <div class="absolute bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))] right-4 text-right sm:bottom-6 sm:right-6">
      <div class="font-display text-3xl leading-none sm:text-5xl">{s.mag}<span class="text-xl text-white/50 sm:text-2xl"> / {s.reserve}</span></div>
      <div class="mt-1 text-xs tracking-[0.2em] text-white/70 sm:text-sm">{s.weapon}</div>
      <div class="text-[10px] uppercase tracking-[0.2em] text-white/40">{s.nades}</div>
    </div>

    {#if !s.locked && s.alive && !s.buyOpen && !s.paused}
      <p class="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs tracking-[0.28em] text-white/70">
        {s.touch ? 'TOUCH THE PADS TO PLAY' : 'CLICK TO TAKE CONTROL'}
      </p>
    {/if}

    {#if !s.alive && !s.gameover}
      <p class="absolute left-1/2 top-1/3 -translate-x-1/2 font-display text-4xl tracking-[0.3em]">YOU ARE DEAD</p>
    {/if}

    {#if s.scoreboard}
      <div class="panel absolute left-1/2 top-1/2 w-[46rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 border border-white/15 bg-black/80 p-4">
        <div class="mb-3 flex justify-between font-display text-3xl">
          <span class="text-tr">TERRORISTS {s.score.T}</span>
          <span class="text-ct">CT {s.score.CT}</span>
        </div>
        {#each ['T', 'CT'] as team}
          <div class="mb-3">
            {#each (s.board || []).filter((p) => p.team === team) as p}
              <div class="grid grid-cols-7 gap-2 border-t border-white/10 py-1 text-sm {p.alive ? '' : 'opacity-40'}">
                <span class="col-span-2 {team === 'CT' ? 'text-ct' : 'text-tr'}">{p.name}{p.bot ? '' : ' ·'}</span>
                <span>{p.kills}</span>
                <span>{p.deaths}</span>
                <span>{p.assists}</span>
                <span>${p.money}</span>
                <span class="text-right">{p.ping}ms</span>
              </div>
            {/each}
          </div>
        {/each}
        <p class="text-[10px] tracking-[0.2em] text-white/40">K / D / A / MONEY / PING</p>
      </div>
    {/if}

    {#if s.paused}
      <div class="panel absolute left-1/2 top-1/2 w-80 -translate-x-1/2 -translate-y-1/2 border border-white/15 bg-black/85 p-5">
        <p class="font-display text-4xl tracking-[0.2em]">PAUSED</p>
        <label class="mt-4 block text-xs uppercase tracking-widest text-white/50">
          Sensitivity
          <input class="mt-2 w-full" type="range" min="0.0008" max="0.006" step="0.0001" bind:value={$settings.sensitivity} />
        </label>
        <label class="mt-3 block text-xs uppercase tracking-widest text-white/50">
          Volume
          <input class="mt-2 w-full" type="range" min="0" max="1" step="0.01" bind:value={$settings.volume} />
        </label>
        <button class="mt-4 w-full bg-sand py-2 font-display text-xl tracking-[0.2em] text-black" on:click={() => api.resume()}>RESUME</button>
        <button class="mt-2 w-full border border-white/20 py-2 text-xs tracking-[0.2em]" on:click={() => api.quit()}>LEAVE MATCH</button>
      </div>
    {/if}

    {#if s.gameover}
      <div class="panel absolute left-1/2 top-1/2 w-96 -translate-x-1/2 -translate-y-1/2 border border-white/15 bg-black/85 p-6 text-center">
        <p class="font-display text-4xl tracking-[0.14em]">{s.winner === 'T' ? 'TERRORISTS' : 'COUNTER-TERRORISTS'}</p>
        <p class="mt-2 text-xs tracking-[0.3em] text-sand">MATCH OVER</p>
        <button class="mt-5 w-full bg-sand py-2 font-display text-xl tracking-[0.2em] text-black" on:click={() => api.quit()}>RETURN</button>
      </div>
    {/if}

    <p class="absolute right-4 bottom-1 text-[10px] text-white/30">{s.fps} FPS</p>
  </div>
{/if}
