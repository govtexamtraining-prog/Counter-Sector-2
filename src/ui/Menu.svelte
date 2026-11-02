<script>
  import { screen, bootText, settings, api, diag } from './store.js'
  let manual = false
  let mp = false

  function deploy() {
    api.startLocal({ ...$settings })
  }
  function connect() {
    api.startMulti({ ...$settings })
  }
</script>

<div class="pointer-events-auto absolute inset-0 flex overflow-auto">
  <div class="absolute inset-0 bg-gradient-to-r from-ink via-ink/90 to-ink/25"></div>
  <div class="relative z-10 flex w-full max-w-xl flex-col justify-between px-6 py-6 sm:px-10 sm:py-8 md:px-14">
    <div>
      <p class="font-display text-xs tracking-[0.42em] text-sand">BROWSER DEFUSAL</p>
      <h1 class="mt-2 font-display text-5xl font-semibold leading-none tracking-wide text-white sm:text-7xl">
        COUNTER<br />SECTOR <span class="text-sand">2</span>
      </h1>
      <p class="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
        Sub-tick aim, a bomb economy, and a five-on-five sector built for the browser.
        Map <span class="text-sand">de_sector</span>. Rendering, bots, and look sampling run on your device so the match server stays thin.
      </p>
    </div>

    {#if $screen === 'boot' || $screen === 'loading'}
      <div class="border border-white/15 bg-black/40 px-4 py-5">
        <p class="font-display text-2xl tracking-widest text-sand">{$screen === 'boot' ? 'INITIALIZING' : 'DEPLOYING'}</p>
        <p class="mt-2 text-sm text-white/70">{$bootText}</p>
      </div>
    {:else}
      <div class="space-y-4">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="text-xs uppercase tracking-widest text-white/50">
            Name
            <input class="mt-1 w-full border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none" bind:value={$settings.name} maxlength="16" />
          </label>
          <label class="text-xs uppercase tracking-widest text-white/50">
            Side
            <select class="mt-1 w-full border border-white/15 bg-black/40 px-3 py-2 text-sm" bind:value={$settings.team}>
              <option value="CT">Counter-Terrorist</option>
              <option value="T">Terrorist</option>
              <option value="random">Random</option>
            </select>
          </label>
          <label class="text-xs uppercase tracking-widest text-white/50">
            Bots
            <select class="mt-1 w-full border border-white/15 bg-black/40 px-3 py-2 text-sm" bind:value={$settings.difficulty}>
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label class="text-xs uppercase tracking-widest text-white/50">
            Match
            <select class="mt-1 w-full border border-white/15 bg-black/40 px-3 py-2 text-sm" bind:value={$settings.rounds}>
              <option value="quick">Quick · first to 5</option>
              <option value="full">Regulation · first to 13</option>
            </select>
          </label>
          <label class="text-xs uppercase tracking-widest text-white/50">
            Finish
            <select class="mt-1 w-full border border-white/15 bg-black/40 px-3 py-2 text-sm" bind:value={$settings.skin}>
              <option value="standard">Field</option>
              <option value="night">Night</option>
              <option value="brass">Brass</option>
            </select>
          </label>
          <label class="text-xs uppercase tracking-widest text-white/50">
            Device quality
            <select class="mt-1 w-full border border-white/15 bg-black/40 px-3 py-2 text-sm" bind:value={$settings.quality}>
              <option value="auto">Auto · phone uses less GPU locally</option>
              <option value="mobile">Mobile · lowest local draw cost</option>
              <option value="high">High · desktop shadows</option>
            </select>
          </label>
          <label class="text-xs uppercase tracking-widest text-white/50">
            Look
            <input class="mt-3 w-full" type="range" min="0.0008" max="0.006" step="0.0001" bind:value={$settings.sensitivity} />
          </label>
          <label class="text-xs uppercase tracking-widest text-white/50">
            Touch look
            <input class="mt-3 w-full" type="range" min="0.8" max="2.4" step="0.05" bind:value={$settings.touchSensitivity} />
          </label>
        </div>
        <button class="w-full bg-sand px-4 py-3 font-display text-2xl tracking-[0.25em] text-black" on:click={deploy}>
          DEPLOY
        </button>
        <div class="flex gap-2">
          <button class="flex-1 border border-white/20 px-3 py-2 text-xs tracking-[0.2em]" on:click={() => (mp = !mp)}>MULTIPLAYER</button>
          <button class="flex-1 border border-white/20 px-3 py-2 text-xs tracking-[0.2em]" on:click={() => (manual = !manual)}>MANUAL</button>
        </div>
        {#if mp}
          <div class="border border-white/15 bg-black/50 p-3">
            <p class="text-xs text-white/60">Start <span class="text-sand">npm run server</span>, then connect. Empty slots are filled by bots. Phones still render and predict locally; the host only receives thin input packets.</p>
            <input class="mt-2 w-full border border-white/15 bg-black/40 px-3 py-2 text-sm" bind:value={$settings.server} />
            <button class="mt-2 w-full border border-sand px-3 py-2 text-xs tracking-[0.2em] text-sand" on:click={connect}>CONNECT</button>
          </div>
        {/if}
        {#if manual}
          <div class="max-h-64 overflow-auto border border-white/15 bg-black/50 p-3 text-xs leading-5 text-white/75">
            <p class="text-sand">CS-style keyboard</p>
            <p>WASD / arrows move · mouse aim · LMB fire · RMB aim / zoom · R reload · Shift or Alt walk · CapsLock walk toggle</p>
            <p>Ctrl or C crouch · Space jump · E use / plant / defuse · F inspect · G drop · B buy · Tab or M scoreboard · Esc pause</p>
            <p>1–5 / numpad weapon slots · Q last weapon · mouse wheel or [ ] cycle · mouse 4/5 last</p>
            <p>Radio: Z X V T Y , . H J K L U I O P (client banners only, no server traffic)</p>
            <p class="mt-2 text-sand">Mobile pad</p>
            <p>Left stick move · right pad look · FIRE AIM JUMP DUCK · WALK R E G B TAB RADIO F ESC · 1–5 Q [ ]</p>
            <p>Buy only inside spawn during buy phase. Plant on A or B. Smokes block vision and tear when shot.</p>
          </div>
        {/if}
      </div>
    {/if}

    <div class="mt-4 flex flex-wrap gap-4 text-[10px] uppercase tracking-[0.18em] text-white/45">
      <span>Nav {$diag.nav}</span>
      <span>Physics {$diag.physics}</span>
      <span>BVH {$diag.bvh}</span>
      <span>Client-heavy</span>
    </div>
  </div>
</div>
