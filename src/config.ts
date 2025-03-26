import { Duration } from '@ethersphere/bee-js'
import { Types } from 'cafe-utility'

export interface AppConfig {
    beeApiUrl: string
    hostname: string
    authorization?: string
    instanceName?: string
    moderationSecret?: string
    removePinHeader?: boolean
    readinessCheck?: boolean
    homepage?: string
}

export interface ServerConfig {
    hostname: string
    port: number
}

interface StampsConfigHardcoded {
    mode: 'hardcoded'
    stamp: string
}
export interface StampsConfigExtends {
    mode: 'extendsTTL'
    ttlMin: Duration
    depth: number
    amount: string
    refreshPeriod: number
    beeApiUrl: string
}

export interface ContentConfigReupload {
    beeApiUrl: string
    refreshPeriod: number
}

export interface StampsConfigAutobuy {
    mode: 'autobuy'
    depth: number
    amount: string
    beeApiUrl: string
    usageThreshold: number
    usageMax: number
    ttlMin: Duration
    refreshPeriod: number
}

export type StampsConfig = StampsConfigHardcoded | StampsConfigAutobuy | StampsConfigExtends

export type ContentConfig = ContentConfigReupload

export type EnvironmentVariables = Partial<{
    // Logging
    LOG_LEVEL: string

    // Proxy
    BEE_API_URL: string
    AUTH_SECRET: string

    // Server
    PORT: string
    HOSTNAME: string

    // Moderation
    MODERATION_SECRET: string
    INSTANCE_NAME: string

    // Identity
    EXPOSE_HASHED_IDENTITY: string

    // Headers manipulation
    REMOVE_PIN_HEADER: string

    // Stamps
    POSTAGE_STAMP: string
    POSTAGE_DEPTH: string
    POSTAGE_AMOUNT: string
    POSTAGE_USAGE_THRESHOLD: string
    POSTAGE_USAGE_MAX: string
    POSTAGE_TTL_MIN: string
    POSTAGE_REFRESH_PERIOD: string
    POSTAGE_EXTENDSTTL: string

    // Homepage
    HOMEPAGE: string
}>

export const SUPPORTED_LEVELS = ['critical', 'error', 'warn', 'info', 'verbose', 'debug'] as const
export type SupportedLevels = typeof SUPPORTED_LEVELS[number]

export const DEFAULT_BEE_API_URL = 'http://localhost:1633'
export const DEFAULT_HOSTNAME = 'localhost'
export const DEFAULT_PORT = 3000
export const DEFAULT_POSTAGE_USAGE_THRESHOLD = 0.7
export const DEFAULT_POSTAGE_USAGE_MAX = 0.9
export const DEFAULT_POSTAGE_REFRESH_PERIOD = 60_000
export const DEFAULT_LOG_LEVEL = 'info'
export const MINIMAL_EXTENDS_TTL_VALUE = 60
export const READINESS_TIMEOUT_MS = 3000
export const ERROR_NO_STAMP = 'No postage stamp'

export const logLevel =
    process.env.LOG_LEVEL && SUPPORTED_LEVELS.includes(process.env.LOG_LEVEL as SupportedLevels)
        ? process.env.LOG_LEVEL
        : DEFAULT_LOG_LEVEL

export function getAppConfig(env: EnvironmentVariables): AppConfig {
    return {
        hostname: env.HOSTNAME || DEFAULT_HOSTNAME,
        beeApiUrl: env.BEE_API_URL || DEFAULT_BEE_API_URL,
        authorization: env.AUTH_SECRET,
        moderationSecret: env.MODERATION_SECRET,
        instanceName: env.INSTANCE_NAME,
        removePinHeader: env.REMOVE_PIN_HEADER ? env.REMOVE_PIN_HEADER === 'true' : true,
        homepage: env.HOMEPAGE
    }
}

export function getServerConfig(env: EnvironmentVariables): ServerConfig {
    return { hostname: env.HOSTNAME || DEFAULT_HOSTNAME, port: Number(env.PORT || DEFAULT_PORT) }
}

export function getStampsConfig(env: EnvironmentVariables): StampsConfig | undefined {
    const refreshPeriod = Number(env.POSTAGE_REFRESH_PERIOD || DEFAULT_POSTAGE_REFRESH_PERIOD)
    const beeApiUrl = env.BEE_API_URL || DEFAULT_BEE_API_URL

    if (env.POSTAGE_STAMP)
        // Start in hardcoded mode
        return {
            mode: 'hardcoded',
            stamp: env.POSTAGE_STAMP
        }
    else if (!env.POSTAGE_EXTENDSTTL && env.POSTAGE_DEPTH && env.POSTAGE_AMOUNT) {
        // Start autobuy
        return {
            mode: 'autobuy',
            depth: Number(env.POSTAGE_DEPTH),
            amount: env.POSTAGE_AMOUNT,
            usageThreshold: Number(env.POSTAGE_USAGE_THRESHOLD || DEFAULT_POSTAGE_USAGE_THRESHOLD),
            usageMax: Number(env.POSTAGE_USAGE_MAX || DEFAULT_POSTAGE_USAGE_MAX),
            ttlMin: Duration.fromSeconds(Types.asNumber(env.POSTAGE_TTL_MIN || refreshPeriod * 5)),
            refreshPeriod,
            beeApiUrl
        }
    } else if (
        env.POSTAGE_EXTENDSTTL === 'true' &&
        env.POSTAGE_AMOUNT &&
        env.POSTAGE_DEPTH &&
        Number(env.POSTAGE_TTL_MIN) >= MINIMAL_EXTENDS_TTL_VALUE
    ) {
        return {
            mode: 'extendsTTL',
            depth: Number(env.POSTAGE_DEPTH),
            ttlMin: Duration.fromSeconds(Types.asNumber(env.POSTAGE_TTL_MIN)),
            amount: env.POSTAGE_AMOUNT,
            refreshPeriod,
            beeApiUrl
        }
    } else if (env.POSTAGE_DEPTH || env.POSTAGE_AMOUNT || env.POSTAGE_TTL_MIN) {
        // Missing one of the variables needed for the autobuy or extends TTL
        throw new Error(
            `config: please provide POSTAGE_DEPTH=${env.POSTAGE_DEPTH}, POSTAGE_AMOUNT=${
                env.POSTAGE_AMOUNT
            }, POSTAGE_TTL_MIN=${env.POSTAGE_TTL_MIN} ${
                env.POSTAGE_EXTENDSTTL === 'true' ? 'at least 60 seconds ' : ''
            }for the feature to work`
        )
    }

    // Stamps rewrite is disabled
    return undefined
}
