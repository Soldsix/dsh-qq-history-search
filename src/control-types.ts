/** Owner-only settings and body-free runtime status. */
import type {Settings} from './fields.ts'
import type {} from '@deepseek-ai/dsh-typert-protocol/types'
/** Saved scope and admission state. */
export interface Snapshot{readonly config:Settings;readonly revision:string;readonly active:boolean;readonly running:number;readonly maintenance:boolean;readonly entryDisabled:boolean;readonly refreshMs:number;readonly toolState:'disabled'|'inactive'|'waiting-provider'|'sender-isolation-required'|'registered';readonly toolRunning:number}
/** Optimistic configuration change. */
export interface SaveRequest{readonly revision:string;readonly patch:Partial<Settings>}
/** Sanitized error categories. */
export type ControlFailure='forbidden'|'cancelled'|'invalid'|'conflict'|'unavailable'|'busy'|'apply-failed'|'request-provider-missing'|'sender-isolation-required'
declare module '@deepseek-ai/dsh-typert-protocol/types'{interface RemoteErrorDetailsMap{
 /** No queries, messages, user IDs or paths are exposed in errors. */
 'qq-history/control':{readonly reason:ControlFailure}
}}
