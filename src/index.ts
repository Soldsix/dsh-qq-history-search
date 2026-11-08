/** Optional scoped history search without model-facing tools. */
import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import {Config,resolve} from './config.ts'
import {HistoryEngine} from './engine.ts'
import type {HistoryService} from './types.ts'
export {Config}
export {HistoryError} from './wire.ts'
export type {Failure} from './wire.ts'
export type * from './types.ts'
/** Native bundle identity. */
export const name='qq-history-search'
/** History paths are relative to the selected DSH profile by default. */
export const inject=['profileContext']
declare module '@deepseek-ai/cordis'{interface Context{readonly qqHistorySearch:HistoryService}}
/** @param ctx - profile-owned Host context. @param config - explicit authorized selections. */
export function apply(ctx:Context,config:Config):void{
 const spec=resolve(config,ctx.profileContext.dir);if(!spec)return
 if(ctx.get('qqHistorySearch'))throw new Error('Another history service is already installed')
 const engine=new HistoryEngine(spec)
 ctx.effect(()=>()=>engine.close());ctx.effect(()=>ctx.provide('qqHistorySearch',engine))
}
