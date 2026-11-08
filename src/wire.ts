/** Validation at the Host request and encrypted cursor boundaries. */
import {z} from 'zod'
import {identifier} from 'dsh-im-kit'
const raw=z.string().refine(x=>x.trim()!==''&&!/[\u0000-\u001f\u007f]/u.test(x))
const tenant=raw.transform(x=>identifier('im.tenant',x)),network=raw.transform(x=>identifier('im.network',x)),account=raw.transform(x=>identifier('im.account',x)),peer=raw.transform(x=>identifier('im.peer',x)),user=raw.transform(x=>identifier('im.user',x)),message=raw.transform(x=>identifier('im.message',x))
const timestamp=z.number().int().nonnegative().safe()
/** Exact account and conversation selected by trusted Host code. */
export const scopeSchema=z.strictObject({account:z.strictObject({tenantId:tenant,networkId:network,accountId:account}),kind:z.enum(['group','private']),peerId:peer})
/** Untrusted invocation parameters are checked before resource allocation. */
export const requestSchema=z.strictObject({scope:scopeSchema,requester:user,query:z.string().max(256),limit:z.number().int().min(1).max(100),sender:user.optional(),allSenders:z.boolean().optional(),before:z.string().min(1).max(2048).optional()})
/** Decrypted pagination position. */
export const positionSchema=z.strictObject({receivedAt:timestamp,messageId:message})
/** Operational codes never include query text or database paths. */
export type Failure='invalid-data'|'forbidden'|'capacity'|'timeout'|'cancelled'|'closed'|'missing'|'schema-unsupported'|'unavailable'|'busy'
/** Sanitized failure surfaced to the trusted Host. */
export class HistoryError extends Error{constructor(readonly code:Failure){super('History: '+code)}}
