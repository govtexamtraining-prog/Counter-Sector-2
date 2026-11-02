<script>
  import { screen } from './store.js'
  import Menu from './Menu.svelte'
  import HUD from './HUD.svelte'
  import BuyMenu from './BuyMenu.svelte'
  import MobilePad from './MobilePad.svelte'
  import { snap } from './store.js'
</script>

{#if $screen !== 'playing'}
  <Menu />
{/if}
{#if $screen === 'playing'}
  <HUD />
  <MobilePad />
  {#if $snap?.buyOpen}
    <BuyMenu />
  {/if}
{/if}
