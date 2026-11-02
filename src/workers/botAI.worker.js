import { planBots } from '../sim/bots.js'

let nav = null
const memory = {}

self.onmessage = (event) => {
  const msg = event.data
  if (msg.type === 'nav') {
    nav = msg.nav
    self.postMessage({ type: 'ready' })
    return
  }
  if (msg.type === 'plan') {
    const orders = planBots(msg.state, nav, msg.senses || {}, msg.dt || 0.1, memory)
    self.postMessage({ type: 'orders', orders })
  }
}
