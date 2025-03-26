#!/usr/bin/env node
import { Application } from 'express'
import { EnvironmentVariables, getAppConfig, getServerConfig, getStampsConfig } from './config'
import { logger, subscribeLogServerRequests } from './logger'
import { createApp } from './server'
import { StampManager } from './stamps'

async function main() {
    // Configuration
    const stampsConfig = getStampsConfig(process.env as EnvironmentVariables)
    const appConfig = getAppConfig(process.env as EnvironmentVariables)
    const { hostname, port } = getServerConfig(process.env as EnvironmentVariables)

    logger.debug('proxy config', appConfig)
    logger.debug('server config', { hostname: hostname, port })

    let app: Application

    if (stampsConfig) {
        logger.debug('stamps config', stampsConfig)
        const stampManager = new StampManager()
        logger.info('enabled stamp manager')
        stampManager.start(stampsConfig)
        app = createApp(appConfig, stampManager)
    } else {
        logger.info('disabled postage batch management')
        app = createApp(appConfig)
    }

    // Start the Proxy
    const server = app.listen(port, () => {
        logger.info(`starting server at ${hostname}:${port}`)
    })

    subscribeLogServerRequests(server)
}

main()
