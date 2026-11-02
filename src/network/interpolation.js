/**
 * Short snapshot buffer so remote pawns render slightly in the past.
 */
export function createInterpBuffer() {
  const samples = []
  return {
    push(snap) {
      samples.push(snap)
      if (samples.length > 40) samples.shift()
    },
    latest() {
      return samples[samples.length - 1] || null
    },
    /**
     * @param {number} [delay]
     */
    sample(delay = 0.09) {
      if (!samples.length) return null
      if (samples.length < 2) return { players: samples[0].players, snap: samples[0] }
      const newest = samples[samples.length - 1]
      const when = newest.time - delay
      let older = samples[0]
      let newer = newest
      for (let i = 0; i < samples.length - 1; i++) {
        if (samples[i].time <= when && samples[i + 1].time >= when) {
          older = samples[i]
          newer = samples[i + 1]
          break
        }
      }
      const span = newer.time - older.time || 1
      const f = Math.min(1, Math.max(0, (when - older.time) / span))
      const players = newer.players.map((player) => {
        const prev = older.players.find((entry) => entry.id === player.id) || player
        return {
          ...player,
          pos: {
            x: prev.pos.x + (player.pos.x - prev.pos.x) * f,
            y: prev.pos.y + (player.pos.y - prev.pos.y) * f,
            z: prev.pos.z + (player.pos.z - prev.pos.z) * f
          },
          lookYaw: prev.lookYaw + angleDelta(prev.lookYaw, player.lookYaw) * f
        }
      })
      return { players, snap: newest }
    }
  }
}

function angleDelta(from, to) {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
