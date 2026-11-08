/** Owner-only settings with a query admission gate during changes. */
import {createHash} from 'node:crypto'
import type {Context} from '@deepseek-ai/cordis'
import type {Entry} from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import {Remote,RemoteError,TypertRemoteService,principalOf} from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-config-editor'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from './index.ts'
import type {HistoryService} from './types.ts'
import {Config as RuntimeConfig,resolve} from './config.ts'
import {FIELDS,type Settings} from './fields.ts'
import {saveSchema} from './control-codecs.ts'
import type {ControlFailure,Snapshot} from './control-types.ts'
/** Profile entry and polling interval. */
export interface ControlConfig{targetEntryId:string;statusRefreshMs:number}
/** Settings remain visible when execution is disabled. */
export const Config:z<ControlConfig>=z.object({targetEntryId:z.string().default('qq-history-search'),statusRefreshMs:z.number().min(250).max(60000).step(1).default(3000)})
declare module '@deepseek-ai/cordis'{interface Context{readonly qqHistoryControl:HistoryControl}}
const fail=(reason:ControlFailure)=>new RemoteError('qq-history/control','History settings operation could not complete',{reason})
function parse(value:unknown,profile:string):Settings{
 try{if(typeof value!=='object'||!value||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(FIELDS,key)))throw fail('invalid');const config=z.resolve(value,RuntimeConfig,{})[0];resolve(config,profile);return config}catch(error){throw fail('invalid')}
}
function revision(value:Settings):string{return createHash('sha256').update(JSON.stringify(Object.keys(FIELDS).map(key=>[key,value[key as keyof Settings]]))).digest('hex')}
/** Only the profile owner may inspect and change history configuration. */
export class HistoryControl extends TypertRemoteService{
 static inject=['configEditor','profileContext']
 static Config=Config
 private readonly lifetime=new AbortController()
 private tail:Promise<void>=Promise.resolve()
 private history:HistoryService|undefined
 constructor(ctx:Context,private readonly config:ControlConfig){super(ctx,'qqHistoryControl');if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(config.targetEntryId))throw new Error('Invalid target entry');ctx.inject(['qqHistorySearch'],child=>{const service=child.qqHistorySearch;this.history=service;child.effect(()=>()=>{if(this.history===service)this.history=undefined})});ctx.effect(()=>async()=>{this.lifetime.abort();await this.tail})}
 private owner():void{if(principalOf(this.ctx.invocation))throw fail('forbidden');if(this.lifetime.signal.aborted||this.ctx.invocation?.signal.aborted)throw fail('cancelled')}
 private target():Entry{const all=this.ctx.configEditor.entries(),entry=all.find(value=>value.options.id===this.config.targetEntryId);if(!entry||entry.options.name!=='dsh-qq-history-search'||!entry.fiber||all.some(value=>value!==entry&&value.options.name==='dsh-qq-history-search'))throw fail('unavailable');return entry}
 private snapshot():Snapshot{
  const entry=this.target(),config=parse(entry.fiber?.effectiveConfig,this.ctx.profileContext.dir),service=this.history,status=service?.status()
  return{config:structuredClone(config),revision:revision(config),active:Boolean(service),running:status?.active??0,maintenance:status?.maintenance??false,entryDisabled:entry.disabled,refreshMs:this.config.statusRefreshMs}
 }
 private serial<T>(operation:()=>Promise<T>):Promise<T>{this.owner();const task=this.tail.then(()=>{if(this.lifetime.signal.aborted)throw fail('cancelled');return operation()});this.tail=task.then(()=>{},()=>{});return task}
 /** @returns settings and counters without messages or search terms. */
 @Remote
 describe():Promise<Snapshot>{return this.serial(async()=>this.snapshot())}
 /** @param request - expected revision and requested changes. @returns effective settings. */
 @Remote
 save(request:unknown):Promise<Snapshot>{
  this.owner();let edit:ReturnType<typeof saveSchema.parse>;try{edit=saveSchema.parse(request)}catch(error){throw fail('invalid')}
  return this.serial(async()=>{
   const entry=this.target(),current=parse(entry.fiber?.effectiveConfig,this.ctx.profileContext.dir)
   if(revision(current)!==edit.revision)throw fail('conflict')
   parse({...current,...edit.patch},this.ctx.profileContext.dir)
   const service=this.history;if(!service&&current.enabled&&!entry.disabled)throw fail('busy')
   if(service&&!service.beginMaintenance())throw fail('busy')
   let reason:ControlFailure='apply-failed'
   try{await this.ctx.configEditor.edit(entry,raw=>{
    if(revision(parse(entry.fiber?.effectiveConfig,this.ctx.profileContext.dir))!==edit.revision){reason='conflict';throw fail(reason)}
    if(this.history!==service){reason='busy';throw fail(reason)}
    return{...raw,...edit.patch}
   })}catch(error){throw fail(reason)}finally{service?.endMaintenance()}
   return this.snapshot()
  })
 }
}
export default HistoryControl
