import axios from 'axios'
import { Cache, Dates, Objects, Strings, Types } from 'cafe-utility'
import { Application, Response } from 'express'
import { IncomingHttpHeaders } from 'http'
import { subdomainToBzz } from './bzz-link'
import {
    getAllowedUserAgentsRows,
    getOnlyRulesRowOrNull,
    getOnlySettingsRowOrNull,
    SettingsRow,
    SettingsRowId
} from './database/Schema'
import { logger } from './logger'
import { getNotFoundPage } from './not-found'
import { StampManager } from './stamp'

export const GET_PROXY_ENDPOINTS = ['/chunks/*', '/bytes/*', '/bzz/*', '/feeds/*']
export const POST_PROXY_ENDPOINTS = ['/chunks', '/bytes', '/bzz', '/soc/*', '/feeds/*']

const DEFAULT_SETTINGS: SettingsRow = {
    id: -1 as SettingsRowId,
    name: 'default',
    defaultWebsiteRule: 'deny',
    defaultFileRule: 'allow',
    defaultEnsRule: 'allow',
    redirectUri: ''
}

const BAD_PATH = `bzz/${'00'.repeat(32)}`
const SWARM_STAMP_HEADER = 'swarm-postage-batch-id'
const SWARM_PIN_HEADER = 'swarm-pin'

interface Options {
    beeApiUrl: string
    removePinHeader: boolean
    instanceName?: string
    stampManager: StampManager
    hostname?: string
    allowGsocUploadsOnly?: boolean
}

export function createProxyEndpoints(app: Application, options: Options) {
    app.use(async (req, res, next) => {
        const subdomain = options.hostname && req.hostname ? Strings.before(req.hostname, options.hostname) : null

        if (!options.hostname || !subdomain || req.method !== 'GET') {
            next()
            return
        }

        try {
            const newUrl = await subdomainToBzz(
                subdomain.slice(0, -1) // remove trailing dot
            )
            await fetchAndRespond(
                'GET',
                Strings.joinUrl('bzz', newUrl, req.path),
                req.query,
                req.headers,
                req.body,
                res,
                options
            )
        } catch (error) {
            logger.error('proxy failed', error)
            res.sendStatus(500)
        }
    })
    app.get(GET_PROXY_ENDPOINTS, async (req, res) => {
        if (req.path.includes(BAD_PATH)) {
            res.status(400)
            res.send({ error: 'bad path' })

            return
        }
        await fetchAndRespond('GET', req.path, req.query, req.headers, req.body, res, options)
    })

    if (options.allowGsocUploadsOnly) {
        // Only enable /soc/* POST endpoint when GSOC-only mode is enabled
        app.post(['/soc/*'], async (req, res) => {
            await fetchAndRespond('POST', req.path, req.query, req.headers, req.body, res, options)
        })
    } else {
        // Enable all POST endpoints when in normal mode
        app.post(POST_PROXY_ENDPOINTS, async (req, res) => {
            await fetchAndRespond('POST', req.path, req.query, req.headers, req.body, res, options)
        })
    }
}

async function fetchAndRespond(
    method: 'GET' | 'POST',
    path: string,
    query: Record<string, unknown>,
    headers: IncomingHttpHeaders,
    body: unknown,
    res: Response,
    options: Options
) {
    if (options.removePinHeader) {
        delete headers[SWARM_PIN_HEADER]
    }

    try {
        if (method === 'POST' && options.stampManager.enabled) {
            headers[SWARM_STAMP_HEADER] = options.stampManager.getPostageStamp()
        }
        if (body && Buffer.isBuffer(body)) {
            body = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
        }
        let response = await axios({
            method,
            url: Strings.joinUrl(options.beeApiUrl, path) + Objects.toQueryString(query, true),
            data: body,
            headers,
            timeout: Dates.minutes(20),
            validateStatus: status => status < 500,
            responseType: 'arraybuffer',
            maxRedirects: 0
        })

        if (response.status === 404 || (response.status >= 300 && response.status < 400)) {
            const url = Strings.joinUrl(options.beeApiUrl, path) + '.html' + Objects.toQueryString(query, true)
            const probeResponse = await axios({
                method,
                url,
                data: body,
                headers,
                timeout: Dates.minutes(20),
                validateStatus: status => status < 500,
                responseType: 'arraybuffer',
                maxRedirects: 0
            })

            if (probeResponse.status >= 200 && probeResponse.status < 300) {
                response = probeResponse
            }
        }

        if (response.status === 404) {
            const sliceFn = Objects.getDeep(response.data, 'slice')
            if (Types.isFunction(sliceFn)) {
                const text = (sliceFn.call(response.data, 0, 100) as Buffer).toString('utf8')
                if (text.includes('address not found or incorrect')) {
                    res.status(404).contentType('text/html').send(getNotFoundPage())
                    return
                }
            }
        }

        let isHtml = false

        if (response.headers['content-type'] === 'text/html') {
            isHtml = true
        } else if ((response.headers['content-disposition'] || '').toLowerCase().includes('.htm')) {
            isHtml = true
        } else {
            const sliceFn = Objects.getDeep(response.data, 'slice')
            if (Types.isFunction(sliceFn)) {
                const beginning = (sliceFn.call(response.data, 0, 50) as Buffer).toString('utf8')
                isHtml = beginning.toLowerCase().includes('<!doctype html')
            }
        }

        if (isHtml) {
            response.headers['content-type'] = 'text/html'
        }

        const settings = await Cache.get<SettingsRow>('settings', Dates.minutes(1), async () => {
            if (!options.instanceName) {
                return DEFAULT_SETTINGS
            }
            const row = await getOnlySettingsRowOrNull({ name: options.instanceName })
            return row || DEFAULT_SETTINGS
        })

        let allowed = path.includes('.eth')
            ? settings.defaultEnsRule === 'allow'
            : isHtml
            ? settings.defaultWebsiteRule === 'allow'
            : settings.defaultFileRule === 'allow'

        const userAgents = await Cache.get<string[]>('user-agents', Dates.minutes(1), async () => {
            try {
                const rows = await getAllowedUserAgentsRows()
                return rows.map(x => x.userAgent)
            } catch (error) {
                logger.error('failed to query user agents', error)
                return []
            }
        })

        const userAgentMatch = userAgents.some(x => headers['user-agent']?.toLowerCase().includes(x.toLowerCase()))

        if (userAgentMatch) {
            allowed = true
        }

        const currentCid = Strings.searchSubstring(path, x => x.length > 48 && x.startsWith('bah'))
        const currentHash = Strings.searchHex(path, 64)
        const hash = currentCid || currentHash
        const rule = hash ? await getOnlyRulesRowOrNull({ hash }).catch(() => null) : null

        if (rule) {
            if (rule.mode === 'deny') {
                allowed = false
            } else if (rule.mode === 'allow') {
                allowed = true
            }
        }

        if (!allowed) {
            if (hash) {
                res.redirect(`${settings.redirectUri}/forbidden?hash=${hash}`)
            } else {
                res.redirect(`${settings.redirectUri}/forbidden`)
            }
            return
        }

        delete response.headers['content-length']
        delete response.headers['content-encoding']
        delete response.headers['transfer-encoding']
        delete response.headers.connection
        delete response.headers.etag
        delete response.headers['last-modified']
        delete response.headers['cache-control']

        res.set(response.headers).status(response.status).send(response.data)
    } catch (error) {
        logger.error('proxy failed', error)
        res.sendStatus(500)
    }
}
