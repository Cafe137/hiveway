import { Dates } from 'cafe-utility'
import { createServer, Socket } from 'net'
import { TcpProxyConfig } from './config'
import { getOnlyTcpProxySourcesRowOrNull } from './database/Schema'
import { logger } from './logger'

export function startTcpProxy(config: TcpProxyConfig) {
    const server = createServer(async clientSocket => {
        let destinationSocket: Socket | null = null
        clientSocket.setTimeout(Dates.minutes(10))
        clientSocket.on('timeout', () => {
            clientSocket.destroy()
            if (destinationSocket) {
                destinationSocket.destroy()
            }
        })
        const row = await getOnlyTcpProxySourcesRowOrNull({ origin: clientSocket.remoteAddress })
        if (!row) {
            clientSocket.end()
            return
        }
        destinationSocket = new Socket()
        destinationSocket.on('error', () => {
            clientSocket.destroy()
        })
        destinationSocket.connect(config.destinationPort, config.destinationHost, () => {
            clientSocket.pipe(destinationSocket)
            destinationSocket.pipe(clientSocket)
        })
    })
    server.listen(config.sourcePort)
    logger.info(`TCP proxy server started :${config.sourcePort} -> ${config.destinationHost}:${config.destinationPort}`)
}
