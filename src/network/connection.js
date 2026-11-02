/** @param {string} url */
export function connect(url) {
  const ws = new WebSocket(url)
  const handlers = new Map()
  ws.addEventListener('message', (event) => {
    let msg
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    handlers.get(msg.t)?.(msg)
    handlers.get('*')?.(msg)
  })
  return {
    socket: ws,
    on(type, fn) {
      handlers.set(type, fn)
    },
    send(payload) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload))
    },
    close() {
      ws.close()
    }
  }
}
