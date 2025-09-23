import { buildSelect, getOnlyRowOrNull, getOnlyRowOrThrow, getRows, insert, SelectOptions, update } from './Database'

export type TcpProxySourcesRowId = number & { __brand: 'TcpProxySourcesRowId' }

export interface TcpProxySourcesRow {
    id: TcpProxySourcesRowId
    name: string
    origin: string
    createdAt: Date
}

export interface NewTcpProxySourcesRow {
    name: string
    origin: string
    createdAt?: Date | null
}

export const TcpProxySources = {
    async getMany(
        filter?: Partial<TcpProxySourcesRow>,
        options?: SelectOptions<TcpProxySourcesRow>
    ): Promise<TcpProxySourcesRow[]> {
        const [query, values] = buildSelect(filter, options)
        return getRows('SELECT * FROM tcpProxySources' + query, ...values) as unknown as TcpProxySourcesRow[]
    },

    async getOneOrNull(
        filter?: Partial<TcpProxySourcesRow>,
        options?: SelectOptions<TcpProxySourcesRow>
    ): Promise<TcpProxySourcesRow | null> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrNull(
            'SELECT * FROM tcpProxySources' + query,
            ...values
        ) as unknown as TcpProxySourcesRow | null
    },

    async getOneOrThrow(
        filter?: Partial<TcpProxySourcesRow>,
        options?: SelectOptions<TcpProxySourcesRow>
    ): Promise<TcpProxySourcesRow> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrThrow('SELECT * FROM tcpProxySources' + query, ...values) as unknown as TcpProxySourcesRow
    },

    async update(
        id: TcpProxySourcesRowId,
        object: Partial<NewTcpProxySourcesRow>,
        atomicHelper?: {
            key: keyof NewTcpProxySourcesRow
            value: unknown
        }
    ): Promise<number> {
        return update('tcpProxySources', id, object, atomicHelper)
    },

    async insert(object: NewTcpProxySourcesRow): Promise<TcpProxySourcesRowId> {
        return insert('tcpProxySources', object as unknown as Record<string, unknown>) as Promise<TcpProxySourcesRowId>
    }
}
