/** Strict Client descriptors for owner-only history settings. */
import type {RemoteResult,TypertRemoteContribution} from '@deepseek-ai/dsh-typert-protocol/types'
import type {Snapshot,SaveRequest} from '../control-types.ts'
import {saveSchema,snapshotSchema} from '../control-codecs.ts'
declare module '@deepseek-ai/dsh-typert-protocol/types'{interface TypertRemoteNamespaceMap{
 /** History owner settings. */
 qqHistoryControl:{describe():Promise<RemoteResult<Snapshot>>;save(request:SaveRequest):Promise<RemoteResult<Snapshot>>}
}}
/** Native remote operations for history settings. */
export const remote:TypertRemoteContribution={package:'dsh-qq-history-search',descriptors:['describe','save'].map(method=>({id:`qqHistoryControl/${method}`,service:'qqHistoryControl',namespace:'qqHistoryControl',method,invocation:{kind:'direct'},parameters:method==='describe'?[]:[{name:'request',wire:'request',source:'json',codec:{mode:'strict',typeSymbol:'dsh-qq-history-search#saveRequest',create:()=>saveSchema}}],result:{mode:'strict',typeSymbol:'dsh-qq-history-search#snapshot',create:()=>snapshotSchema}}))}
