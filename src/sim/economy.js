import { MAX_ARMOR, MAX_MONEY } from '../sim/constants.js'
import { inBuyZone } from '../sim/map.js'
import { GEAR, NADES, WEAPONS, fullClip, itemDef } from '../sim/weapons.js'

/** @param {number} streak */
export function lossBonus(streak) {
  const s = Math.max(1, Math.min(5, streak))
  return 1400 + (s - 1) * 500
}

/** @param {string} weaponId */
export function killReward(weaponId) {
  if (weaponId === 'knife') return 1500
  if (weaponId === 'nova') return 900
  if (weaponId === 'mac10' || weaponId === 'mp9') return 600
  return 300
}

/** @param {object} player */
export function refillAmmo(player) {
  const slots = [player.loadout.primary, player.loadout.secondary]
  for (const entry of slots) {
    if (!entry) continue
    const w = WEAPONS[entry.id]
    if (!w) continue
    entry.mag = w.mag
    entry.reserve = w.reserve
  }
}

/**
 * Spend money and mutate the loadout. Returns a dropped weapon entry when a slot is replaced.
 * @param {object} player
 * @param {object} state
 * @param {string} itemId
 */
export function purchase(player, state, itemId) {
  if (!player.alive) return { ok: false, reason: 'dead' }
  if (state.phase !== 'buy') return { ok: false, reason: 'closed' }
  if (!inBuyZone(player.pos, player.team)) return { ok: false, reason: 'zone' }
  const def = itemDef(itemId)
  if (!def) return { ok: false, reason: 'unknown' }
  if (def.team && def.team !== player.team) return { ok: false, reason: 'team' }
  if ((def.price || 0) > player.money) return { ok: false, reason: 'money' }

  if (itemId === 'ammo') {
    player.money -= def.price
    refillAmmo(player)
    return { ok: true }
  }
  if (itemId === 'vest') {
    if (player.armor >= MAX_ARMOR) return { ok: false, reason: 'full' }
    player.money -= def.price
    player.armor = MAX_ARMOR
    return { ok: true }
  }
  if (itemId === 'vesthelm') {
    if (player.armor >= MAX_ARMOR && player.helmet) return { ok: false, reason: 'full' }
    player.money -= def.price
    player.armor = MAX_ARMOR
    player.helmet = true
    return { ok: true }
  }
  if (itemId === 'kit') {
    if (player.team !== 'CT') return { ok: false, reason: 'team' }
    if (player.kit) return { ok: false, reason: 'full' }
    player.money -= def.price
    player.kit = true
    return { ok: true }
  }
  if (NADES.has(itemId) || GEAR[itemId]?.nade) {
    const nades = player.loadout.grenades
    const maxKind = GEAR[itemId]?.max ?? 1
    if (nades.length >= 4) return { ok: false, reason: 'full' }
    if (nades.filter((n) => n === itemId).length >= maxKind) return { ok: false, reason: 'full' }
    player.money -= def.price
    nades.push(itemId)
    return { ok: true }
  }
  if (def.kind === 'weapon') {
    const slot = def.slot
    if (slot !== 'primary' && slot !== 'secondary') return { ok: false, reason: 'unknown' }
    const dropped = player.loadout[slot]
    player.money -= def.price
    player.loadout[slot] = fullClip(itemId)
    player.slot = slot
    player.money = Math.min(MAX_MONEY, player.money)
    return { ok: true, dropped }
  }
  return { ok: false, reason: 'unknown' }
}

/** @param {number} money */
export function clampMoney(money) {
  return Math.max(0, Math.min(MAX_MONEY, money))
}
