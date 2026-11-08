/** Validation at the Host/worker and durable SQLite boundaries. */
import {z} from 'zod'
import {isAbsolute} from 'node:path'
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
/** One worker receives one fully authorized bounded request. */
export const workerSchema=z.strictObject({directory:z.string().refine(isAbsolute),scope:scopeSchema,sender:z.nullable(user),query:z.string().max(256),limit:z.number().int().min(1).max(100),maxScan:z.number().int().min(1).max(10000),maxScanBytes:z.number().int().min(1024).max(268435456),maxRecordBytes:z.number().int().min(1024).max(67108864),maxResultBytes:z.number().int().min(1024).max(16777216),before:z.nullable(positionSchema)})
const part=z.object({type:z.string(),text:z.string().optional()}).passthrough()
/** Only fields needed by search are read from the durable record. */
export const sourceSchema=z.object({scope:scopeSchema,messageId:message,senderId:user,sentAt:timestamp,receivedAt:timestamp,parts:z.array(part)})
const match=z.strictObject({messageId:message,sender:user,receivedAt:timestamp,sentAt:timestamp,text:z.string(),hasNonText:z.boolean()})
/** Worker output carries no filesystem paths or source errors. */
export const responseSchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),matches:z.array(match),partial:z.boolean(),next:z.nullable(positionSchema)}),z.strictObject({ok:z.literal(false),code:z.enum(['missing','schema-unsupported','invalid-data','unavailable'])})])
/** Operational codes never include query text or database paths. */
export type Failure='invalid-data'|'forbidden'|'capacity'|'timeout'|'cancelled'|'closed'|'missing'|'schema-unsupported'|'unavailable'|'busy'
/** Sanitized failure surfaced to the trusted Host. */
export class HistoryError extends Error{constructor(readonly code:Failure){super('History: '+code)}}
