<script>
  import { snap, api } from './store.js'
  import { GEAR, WEAPONS } from '../sim/weapons.js'

  const columns = [
    { title: 'Pistols', ids: ['p250', 'deagle'] },
    { title: 'Mid', ids: ['mac10', 'mp9', 'nova'] },
    { title: 'Rifles', ids: ['galil', 'famas', 'ak47', 'm4a1', 'awp'] },
    { title: 'Gear', ids: ['vest', 'vesthelm', 'kit', 'he', 'flash', 'smoke', 'molotov', 'ammo'] }
  ]

  function meta(id) {
    return WEAPONS[id] || GEAR[id]
  }

  function allowed(id) {
    const item = meta(id)
    if (!item || !$snap) return false
    if (item.team && item.team !== $snap.team) return false
    return true
  }
</script>

{#if $snap}
  <div class="panel absolute inset-0 flex items-center justify-center bg-black/55">
    <div class="w-[62rem] max-w-[96vw] border border-white/15 bg-[#12110e] p-4">
      <div class="mb-3 flex items-end justify-between">
        <div>
          <p class="font-display text-4xl tracking-[0.18em]">BUY</p>
          <p class="text-xs tracking-[0.22em] text-white/50">{$snap.phase === 'buy' ? 'BUY PHASE' : 'BUY CLOSED'} · {$snap.inZone ? 'IN SPAWN' : 'LEAVE SPAWN AND YOU CANNOT BUY'}</p>
        </div>
        <div class="text-right">
          <p class="font-display text-4xl text-sand">${$snap.money}</p>
          <button class="text-xs tracking-[0.2em] text-white/60" on:click={() => api.closeBuy()}>CLOSE [B]</button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        {#each columns as col}
          <div>
            <p class="mb-2 text-[10px] tracking-[0.28em] text-white/40">{col.title}</p>
            <div class="space-y-1">
              {#each col.ids as id}
                {@const item = meta(id)}
                <button
                  class="flex w-full items-center justify-between border border-white/10 px-2 py-1.5 text-left text-sm disabled:opacity-30"
                  disabled={!allowed(id) || !$snap.canBuy || $snap.money < item.price}
                  on:click={() => api.buy(id)}
                >
                  <span>{item.name}</span>
                  <span class="text-sand">${item.price}</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      <p class="mt-3 text-xs text-white/50">
        Carrying {$snap.weapon} · armor {$snap.armor}{ $snap.helmet ? ' + helmet' : '' } · {$snap.nades || 'no grenades'}
        {$snap.kit ? ' · kit' : ''}
      </p>
    </div>
  </div>
{/if}
