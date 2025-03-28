import { Dates } from 'cafe-utility'
import { createServer, Socket } from 'net'
import { TcpProxyConfig } from './config'
import { getOnlyTcpProxySourcesRowOrNull } from './database/Schema'
import { logger } from './logger'

export function startTcpProxy(config: TcpProxyConfig) {
    const server = createServer(async clientSocket => {
        const row = await getOnlyTcpProxySourcesRowOrNull({ origin: clientSocket.remoteAddress })
        if (!row) {
            clientSocket.end()
            return
        }
        clientSocket.setTimeout(Dates.minutes(10))
        clientSocket.on('timeout', () => {
            clientSocket.destroy()
            destinationSocket.destroy()
        })
        const destinationSocket = new Socket()
        destinationSocket.connect(config.destinationPort, config.destinationHost, () => {
            clientSocket.pipe(destinationSocket)
            destinationSocket.pipe(clientSocket)
        })
        destinationSocket.on('error', () => {
            clientSocket.destroy()
        })
        clientSocket.on('error', () => {
            destinationSocket.destroy()
        })
    })
    server.listen(config.sourcePort)
    logger.info(`TCP proxy server started :${config.sourcePort} -> ${config.destinationHost}:${config.destinationPort}`)
}
