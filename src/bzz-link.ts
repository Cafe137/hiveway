import { Reference } from '@ethersphere/bee-js'
import { getOnlyRewritesRowOrNull } from './database/Schema'

export class NotEnabledError extends Error {}

export async function subdomainToBzz(subdomain: string): Promise<string> {
    const rewrite = await getOnlyRewritesRowOrNull({ subdomain })
    if (rewrite) {
        return rewrite.target
    }
    try {
        return new Reference(subdomain).toHex()
    } catch (e) {
        return `${subdomain}.eth`
    }
}
