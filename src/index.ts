/** Scoped Host search with an optional authenticated native model tool. */
import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from 'dsh-qq-archive'
import {Config,resolve} from './config.ts'
import {HistoryEngine} from './engine.ts'
import type {HistoryService} from './types.ts'
import type {} from 'dsh-im-requests/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import {HistoryModelTool} from './model-tool.ts'
export {Config}
export {HistoryError} from './wire.ts'
export type {Failure} from './wire.ts'
export type * from './types.ts'
export {HISTORY_TOOL,HistoryModelTool} from './model-tool.ts'
export type {HistoryToolValue} from './model-tool.ts'
/** Native bundle identity. */
export const name='qq-history-search'
/** Profile ownership is available even while archive execution is disabled. */
export const inject=['profileContext']
declare module '@deepseek-ai/cordis'{interface Context{readonly qqHistorySearch:HistoryService;readonly qqHistoryModelTool:HistoryModelTool}}
/** @param ctx - profile-owned Host context. @param config - explicit authorized selections. */
export function apply(ctx:Context,config:Config):void{
 const spec=resolve(config,ctx.profileContext.dir);if(!spec)return
 if(ctx.get('qqHistorySearch'))throw new Error('Another history service is already installed')
 ctx.inject(['qqArchive'],child=>{
  const engine=new HistoryEngine(spec,child.qqArchive)
  child.effect(()=>()=>engine.close());child.effect(()=>child.provide('qqHistorySearch',engine))
  if(spec.toolsEnabled)child.inject(['tools','imRequests'],toolsCtx=>{
   if(spec.groups.size&&toolsCtx.imRequests.status().groupSessionMode!=='sender')return
   const tool=new HistoryModelTool(spec,engine,toolsCtx.imRequests)
   toolsCtx.effect(()=>{const detach=toolsCtx.tools.register(tool.definition());return async()=>{detach();await tool.close()}})
   toolsCtx.effect(()=>toolsCtx.provide('qqHistoryModelTool',tool))
  })
 })
}
