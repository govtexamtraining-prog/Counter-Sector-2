import { applyLocomotion } from '../physics/movement.js'
import { MAP } from '../sim/map.js'
import { TICK } from '../sim/constants.js'

/**
 * Replays unacknowledged inputs on top of the latest authoritative pose.
 */
export function createPredictor() {
  /** @type {{tick:number, input:object}[]} */
  const pending = []
  const ghost = {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    grounded: true,
    height: 1.76,
    lookYaw: 0,
    lookPitch: 0,
    scoped: 0,
    planting: 0,
    defusing: 0,
    slot: 'secondary',
    loadout: { primary: null, secondary: null, knife: { id: 'knife', mag: 1, reserve: 0 }, grenades: [], bomb: false }
  }

  return {
    /** @param {number} tick @param {object} input */
    push(tick, input) {
      pending.push({ tick, input })
      if (pending.length > 96) pending.shift()
    },
    /**
     * @param {object} serverPlayer
     * @param {number} serverTick
     */
    reconcile(serverPlayer, serverTick) {
      ghost.pos = { x: serverPlayer.pos.x, y: serverPlayer.pos.y, z: serverPlayer.pos.z }
      ghost.vel = { x: serverPlayer.vel.x, y: serverPlayer.vel.y, z: serverPlayer.vel.z }
      ghost.grounded = !!serverPlayer.grounded
      ghost.height = serverPlayer.height
      ghost.lookYaw = serverPlayer.lookYaw
      ghost.lookPitch = serverPlayer.lookPitch
      ghost.scoped = serverPlayer.scoped || 0
      ghost.slot = serverPlayer.slot || 'secondary'
      ghost.loadout.primary = serverPlayer.primary ? { id: serverPlayer.primary, mag: 30, reserve: 90 } : null
      ghost.loadout.secondary = serverPlayer.secondary
        ? { id: serverPlayer.secondary, mag: 12, reserve: 30 }
        : { id: 'glock', mag: 20, reserve: 120 }
      ghost.loadout.bomb = !!serverPlayer.bomb
      const rest = pending.filter((item) => item.tick > serverTick)
      pending.length = 0
      for (const item of rest) pending.push(item)
      for (const item of rest) {
        ghost.lookYaw = item.input.yaw ?? ghost.lookYaw
        ghost.lookPitch = item.input.pitch ?? ghost.lookPitch
        applyLocomotion(MAP.solids, ghost, item.input, TICK, [])
      }
      return ghost
    }
  }
}
