import { startServer } from './host.js'

const port = Number(process.env.PORT || 3099)
const server = await startServer({ port })
console.log(`Counter Sector 2 match server on ws://localhost:${server.port}`)
