import { writable } from 'svelte/store'

const defaults = {
  sensitivity: 0.0022,
  touchSensitivity: 1.35,
  volume: 0.8,
  difficulty: 'normal',
  rounds: 'quick',
  team: 'CT',
  name: 'Operator',
  skin: 'standard',
  quality: 'auto',
  server: 'ws://localhost:3099'
}

function load() {
  try {
    const raw = localStorage.getItem('counter-sector-settings')
    return { ...defaults, ...(raw ? JSON.parse(raw) : {}) }
  } catch {
    return { ...defaults }
  }
}

export const screen = writable('boot')
export const bootText = writable('Booting simulator')
export const snap = writable(null)
export const diag = writable({ nav: 'pending', physics: 'pending', bvh: 'pending' })
export const settings = writable(load())

settings.subscribe((value) => {
  try {
    localStorage.setItem('counter-sector-settings', JSON.stringify(value))
  } catch {
    /* private mode */
  }
})

/** Filled by the game loop once the engine is up. */
export const api = {
  startLocal() {},
  startMulti() {},
  quit() {},
  buy() {},
  resume() {},
  closeBuy() {},
  toggleBuy() {},
  touchMove() {},
  touchLook() {},
  touchAction() {}
}
