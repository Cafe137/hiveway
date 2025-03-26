import { BatchId, Bee, Duration, PostageBatch } from '@ethersphere/bee-js'
import { Dates, System } from 'cafe-utility'
import client from 'prom-client'
import { ERROR_NO_STAMP, StampsConfig, StampsConfigAutobuy, StampsConfigExtends } from './config'
import { logger } from './logger'
import { register } from './metrics'

const stampPurchaseCounter = new client.Counter({
    name: 'stamp_purchase_counter',
    help: 'How many stamps were purchased'
})
register.registerMetric(stampPurchaseCounter)

const stampPurchaseFailedCounter = new client.Counter({
    name: 'stamp_purchase_failed_counter',
    help: 'How many stamps failed to be purchased'
})
register.registerMetric(stampPurchaseFailedCounter)

const stampCheckCounter = new client.Counter({
    name: 'stamp_check_counter',
    help: 'How many times were stamps retrieved from server'
})
register.registerMetric(stampCheckCounter)

const stampGetCounter = new client.Counter({
    name: 'stamp_get_counter',
    help: 'How many times was get postageStamp called'
})
register.registerMetric(stampGetCounter)

const stampGetErrorCounter = new client.Counter({
    name: 'stamp_get_error_counter',
    help: 'How many times was get postageStamp called and there was no valid postage stamp'
})
register.registerMetric(stampGetErrorCounter)

const stampTtlGauge = new client.Gauge({
    name: 'stamp_ttl_gauge',
    help: 'TTL on the selected automanaged stamp'
})
register.registerMetric(stampTtlGauge)

const stampUsageGauge = new client.Gauge({
    name: 'stamp_usage_gauge',
    help: 'Usage on the selected automanaged stamp'
})
register.registerMetric(stampUsageGauge)

const stampUsableCountGauge = new client.Gauge({
    name: 'stamp_usable_count_gauge',
    help: 'How many stamps exist on the bee node that can be used'
})
register.registerMetric(stampUsableCountGauge)

/**
 * Filter the stamps and only return those that are usable, have correct amount, depth, are not close to beying maxUsage or close to expire
 *
 * @param stamps Postage stamps to be filtered
 * @param depth Postage stamps depth
 * @param amount Postage stamps amount
 * @param maxUsage Maximal usage of the stamp to be usable by the proxy
 * @param minTTL Minimal TTL of the stamp to be usable by the proxy
 *
 * @returns Filtered stamps soltered by usage
 */
export function filterUsableStampsAutobuy(
    stamps: PostageBatch[],
    depth: number,
    amount: string,
    maxUsage: number,
    minTTL: Duration
): PostageBatch[] {
    const usableStamps = stamps
        // filter to get stamps that have the right depth, amount and are not fully used or expired
        .filter(
            s =>
                s.usable &&
                s.depth === depth &&
                s.amount === amount &&
                s.usage < maxUsage &&
                s.duration.toSeconds() > minTTL.toSeconds()
        )
        // sort the stamps by usage
        .sort((a, b) => (a.usage < b.usage ? 1 : -1))

    // return the all usable stamp sorted by usage
    return usableStamps
}

/**
 * Filter the stamps and only return those that are usable and sort by from closer to farer expire TTL
 *
 * @param stamps Postage stamps to be filtered
 *
 * @returns Filtered stamps soltered by usage
 */
export function filterUsableStampsExtends(stamps: PostageBatch[]): PostageBatch[] {
    const usableStamps = stamps
        // filter to get stamps that have the right depth, amount and are not fully used or expired
        .filter(s => s.usable)
        // sort the stamps by usage
        .sort((a, b) => (a.duration.toSeconds() > b.duration.toSeconds() ? 1 : -1))

    // return the all usable stamp sorted by usage
    return usableStamps
}

/**
 * Buy new postage stamp and wait until it is usable
 *
 * @param depth Postage stamps depth
 * @param amount Postage stamps amount
 * @param bee Connection for checking/buying stamps
 * @param options
 *        timeout (optional) How long should the system wait for the stamp to be usable in ms, default to 10000
 *
 * @returns Newly bought postage stamp
 */
export async function buyNewStamp(
    depth: number,
    amount: string,
    bee: Bee
): Promise<{ batchId: BatchId; stamp: PostageBatch }> {
    logger.info(`buying new stamp with amount ${amount} and depth ${depth}`)
    const batchId = await bee.createPostageBatch(amount, depth, { waitForUsable: true })
    stampPurchaseCounter.inc()

    const stamp = await bee.getPostageBatch(batchId)
    logger.info('successfully bought new stamp', { stamp })

    return { batchId, stamp }
}

export async function topUpStamp(bee: Bee, postageBatchId: BatchId | string, amount: string): Promise<PostageBatch> {
    await bee.topUpBatch(postageBatchId, amount)
    const stamp = await bee.getPostageBatch(postageBatchId)

    return stamp
}

export class StampManager {
    private stamp?: BatchId
    private usableStamps?: PostageBatch[]

    /**
     * Get postage stamp that should be replaced in a the proxy request header
     *
     * @return Postage stamp that should be used by the proxy
     *
     * @throws Error if there is no postage stamp
     */
    get postageStamp(): string {
        stampGetCounter.inc()

        if (this.stamp) {
            const stamp = this.stamp
            logger.info('using hardcoded stamp', { stamp })

            return stamp.toHex()
        }

        if (this.usableStamps && this.usableStamps[0]) {
            const stamp = this.usableStamps[0]
            logger.info('using autobought stamp', { stamp })

            return stamp.batchID.toHex()
        }

        stampGetErrorCounter.inc()
        throw new Error(ERROR_NO_STAMP)
    }

    /**
     * Refresh stamps from the bee node and if needed buy new stamp
     *
     * @param config Stamps config
     * @param bee Connection for checking/buying stamps
     */
    public async refreshStampsAutobuy(config: StampsConfigAutobuy, bee: Bee): Promise<void> {
        try {
            stampCheckCounter.inc()
            logger.debug('checking postage stamps')
            const stamps = await bee.getAllPostageBatch()
            logger.debug('retrieved stamps', stamps)

            const { depth, amount, usageMax, usageThreshold, ttlMin } = config

            // Get all usable stamps sorted by usage from most used to least
            this.usableStamps = filterUsableStampsAutobuy(stamps, depth, amount, usageMax, ttlMin)
            const leastUsed = this.usableStamps[this.usableStamps.length - 1]
            const mostUsed = this.usableStamps[0]

            stampTtlGauge.set(mostUsed ? mostUsed.duration.toSeconds() : 0)
            stampUsageGauge.set(mostUsed ? mostUsed.usage : 0)
            stampUsableCountGauge.set(this.usableStamps.length)

            // Check if the least used stamps is starting to get full and if so purchase new stamp
            if (!leastUsed || leastUsed.usage > usageThreshold) {
                try {
                    const { stamp } = await buyNewStamp(depth, amount, bee)

                    // Add the bought postage stamp
                    this.usableStamps.push(stamp)
                    stampUsableCountGauge.set(this.usableStamps.length)
                } catch (error) {
                    logger.error('failed to buy postage stamp', error)
                    stampPurchaseFailedCounter.inc()
                }
            }
        } catch (error) {
            logger.error('failed to refresh postage stamp', error)
        }
    }

    public async refreshStampsExtends(config: StampsConfigExtends, bee: Bee): Promise<void> {
        stampCheckCounter.inc()
        logger.debug('checking postage stamps')

        try {
            const stamps = await bee.getAllPostageBatch()
            logger.debug('retrieved stamps', stamps)

            const { amount, ttlMin, depth } = config

            // Get all usable stamps sorted by usage from most used to least
            this.usableStamps = filterUsableStampsExtends(stamps)

            if (!this.usableStamps.length) {
                try {
                    const { stamp: newStamp } = await buyNewStamp(depth, amount, bee)

                    // Add the bought postage stamp
                    this.usableStamps.push(newStamp)
                } catch (error) {
                    logger.error('failed to buy postage stamp', error)
                }
            } else {
                await this.verifyUsableStamps(bee, ttlMin, config, amount)
            }
        } catch (error) {
            logger.error('failed to refresh on extends postage stamps', error)
        }
    }

    async verifyUsableStamps(
        bee: Bee,
        ttlMin: Duration,
        config: StampsConfigAutobuy | StampsConfigExtends,
        amount: string
    ) {
        for (let i = 0; i < this.usableStamps!.length; i++) {
            const stamp = this.usableStamps![i]

            const minTimeThreshold = ttlMin.toSeconds() + config.refreshPeriod

            if (stamp.duration.toSeconds() < minTimeThreshold) {
                logger.info(`extending postage stamp ${stamp.batchID} with amount ${amount}`)

                try {
                    await topUpStamp(bee, stamp.batchID, amount)
                } catch (error) {
                    logger.error('failed to topup postage stamp', error)
                }
            }
        }
    }

    /**
     * Start the manager in either hardcoded or autobuy mode
     */
    async start(config: StampsConfig): Promise<void> {
        if (config.mode === 'hardcoded') {
            // Hardcoded stamp mode
            this.stamp = new BatchId(config.stamp)
        } else {
            // Autobuy or ExtendsTTL mode
            System.forever(
                async () => {
                    if (config.mode === 'autobuy') {
                        await this.refreshStampsAutobuy(config, new Bee(config.beeApiUrl))
                    } else if (config.mode === 'extendsTTL') {
                        await this.refreshStampsExtends(config, new Bee(config.beeApiUrl))
                    }
                    await System.sleepMillis(Dates.minutes(1))
                },
                config.refreshPeriod,
                logger.error
            )
        }
    }
}
