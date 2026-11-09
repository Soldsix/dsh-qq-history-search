/** Strict JSON codecs for owner-only history settings. */
import * as z from 'zod/mini'
import type {Settings} from './fields.ts'
import type {SaveRequest,Snapshot} from './control-types.ts'
const operator=z.strictObject({tenant:z.string(),network:z.string(),account:z.string(),user:z.string()})
const config=z.strictObject({enabled:z.boolean(),tenants:z.array(z.string()),networks:z.array(z.string()),accounts:z.array(z.string()),groups:z.array(z.string()),privatePeers:z.array(z.string()),operators:z.array(operator),maxConcurrent:z.int(),maxScan:z.int(),maxScanBytes:z.int(),maxResults:z.int(),maxRecordBytes:z.int(),maxResultBytes:z.int(),timeoutMs:z.int(),toolsEnabled:z.boolean(),toolMaxResults:z.int(),toolTextChars:z.int(),toolMatchChars:z.int()} satisfies {[Key in keyof Settings]:z.ZodMiniType<Settings[Key]>})
const revision=z.string().check(z.regex(/^[a-f0-9]{64}$/))
/** Versioned settings patch. */
export const saveSchema:z.ZodMiniType<SaveRequest>=z.strictObject({revision,patch:z.pipe(z.partial(config),z.transform(value=>Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined)) as Partial<Settings>))})
/** Content-free owner snapshot. */
export const snapshotSchema:z.ZodMiniType<Snapshot>=z.strictObject({config,revision,active:z.boolean(),running:z.int(),maintenance:z.boolean(),entryDisabled:z.boolean(),refreshMs:z.int().check(z.minimum(250),z.maximum(60000)),toolState:z.enum(['disabled','inactive','waiting-provider','sender-isolation-required','registered']),toolRunning:z.int()})
