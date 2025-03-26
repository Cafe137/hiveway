import { Reference } from '@ethersphere/bee-js'

export class NotEnabledError extends Error {}

export function subdomainToBzz(subdomain: string, remap: Record<string, string>): string {
    if (subdomain in remap) {
        return remap[subdomain]
    }
    try {
        return new Reference(subdomain).toHex()
    } catch (e) {
        return `${subdomain}.eth`
    }
}
