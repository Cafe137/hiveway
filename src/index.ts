#!/usr/bin/env node
import { EnvironmentVariables, getAppConfig, getServerConfig, getStampConfig, getTcpProxyConfig } from './config'
import { logger, subscribeLogServerRequests } from './logger'
import { createApp } from './server'
import { StampManager } from './stamp'
import { startTcpProxy } from './tcp'

async function main() {
    const stampConfig = getStampConfig(process.env as EnvironmentVariables)
    const appConfig = getAppConfig(process.env as EnvironmentVariables)
    const serverConfig = getServerConfig(process.env as EnvironmentVariables)
    const tcpProxyConfig = getTcpProxyConfig(process.env as EnvironmentVariables)

    logger.debug('proxy config', appConfig)
    logger.debug('server config', serverConfig)
    logger.debug('stamp config', stampConfig)
    logger.debug('tcp proxy config', tcpProxyConfig)

    const stampManager = new StampManager(appConfig.beeApiUrl, stampConfig)
    stampManager.start()

    const app = createApp(appConfig, stampManager)

    const server = app.listen(serverConfig.port, () => {
        logger.info(`starting server at ${serverConfig.hostname}:${serverConfig.port}`)
    })

    if (tcpProxyConfig) {
        startTcpProxy(tcpProxyConfig)
    }

    subscribeLogServerRequests(server)

    process.on('uncaughtException', err => {
        logger.error('Uncaught Exception:', err)
    })

    process.on('unhandledRejection', err => {
        logger.error('Unhandled Rejection:', err)
    })
}

main()
