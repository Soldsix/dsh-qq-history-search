/** Authorization, encrypted scope-bound cursors and cancellable worker ownership. */
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto'
import {Worker} from 'node:worker_threads'
import {scopeKey,type UserId} from 'dsh-im-kit'
import type {Spec} from './config.ts'
import type {HistoryService,SearchPage,SearchRequest} from './types.ts'
import {HistoryError,positionSchema,requestSchema,responseSchema} from './wire.ts'

type Position={receivedAt:number;messageId:string}
/** Bounded read-only searches. Requester identity must come from a trusted Host. */
export class HistoryEngine implements HistoryService{
 private readonly key=randomBytes(32)
 private readonly workers=new Set<Worker>()
 private stopping:Promise<void>|undefined
 private maintenance=false
 /** @param spec - validated scope and resource settings. */
 constructor(private readonly spec:Spec){}
 private seal(position:Position,aad:string):string{
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,nonce);cipher.setAAD(Buffer.from(aad))
  const body=Buffer.concat([cipher.update(JSON.stringify(position),'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),body]).toString('base64url')
 }
 private open(token:string,aad:string):Position{
  try{const bytes=Buffer.from(token,'base64url');if(bytes.length<29)throw new Error('invalid cursor');const cipher=createDecipheriv('aes-256-gcm',this.key,bytes.subarray(0,12));cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(bytes.subarray(12,28));const body=Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]);return positionSchema.parse(JSON.parse(body.toString('utf8')))}catch(error){throw new HistoryError('invalid-data')}
 }
 /** @param input - trusted scope/requester and untrusted query parameters. @param signal - caller cancellation. @returns authorized page; cursors expire on service restart. */
 search(input:SearchRequest,signal:AbortSignal):Promise<SearchPage>{
  if(this.stopping)return Promise.reject(new HistoryError('closed'))
  if(this.maintenance)return Promise.reject(new HistoryError('busy'))
  if(signal.aborted)return Promise.reject(new HistoryError('cancelled'))
  const parsed=requestSchema.safeParse(input);if(!parsed.success)return Promise.reject(new HistoryError('invalid-data'))
  const request=parsed.data,{account,kind,peerId}=request.scope
  if(!this.spec.tenants.has(account.tenantId)||!this.spec.networks.has(account.networkId)||!this.spec.accounts.has(account.accountId)||!(kind==='group'?this.spec.groups:this.spec.privatePeers).has(peerId))return Promise.reject(new HistoryError('forbidden'))
  const operator=this.spec.operators.has(JSON.stringify([account.tenantId,account.networkId,account.accountId,request.requester]))
  if(kind==='private'&&String(peerId)!==String(request.requester)&&!operator)return Promise.reject(new HistoryError('forbidden'))
  if(request.allSenders&&(!operator||request.sender))return Promise.reject(new HistoryError('forbidden'))
  if(request.sender&&request.sender!==request.requester&&!operator)return Promise.reject(new HistoryError('forbidden'))
  if(request.limit>this.spec.maxResults)return Promise.reject(new HistoryError('invalid-data'))
  if(this.workers.size>=this.spec.maxConcurrent)return Promise.reject(new HistoryError('capacity'))
  const sender:UserId|null=request.allSenders?null:request.sender??request.requester,aad=JSON.stringify([scopeKey(request.scope),request.requester,sender,request.query])
  let before:Position|null=null;try{if(request.before)before=this.open(request.before,aad)}catch(error){return Promise.reject(new HistoryError('invalid-data'))}
  const data={directory:this.spec.directory,scope:request.scope,sender,query:request.query,limit:request.limit,maxScan:this.spec.maxScan,maxScanBytes:this.spec.maxScanBytes,maxRecordBytes:this.spec.maxRecordBytes,maxResultBytes:this.spec.maxResultBytes,before}
  let worker:Worker;try{worker=new Worker(new URL('./worker.js',import.meta.url),{workerData:data})}catch(error){return Promise.reject(new HistoryError('unavailable'))}
  this.workers.add(worker)
  return new Promise((resolve,reject)=>{
   let settled=false,page:SearchPage|undefined,failure:HistoryError|undefined
   const stop=()=>{void worker.terminate().catch(()=>{})}
   const finish=(error:HistoryError|undefined,page?:SearchPage)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);if(error)reject(error);else if(page)resolve(page);else reject(new HistoryError('unavailable'))}
   const abort=()=>{finish(new HistoryError('cancelled'));stop()}
   const timer=setTimeout(()=>{finish(new HistoryError('timeout'));stop()},this.spec.timeoutMs)
   worker.once('message',(raw:unknown)=>{
    const result=responseSchema.safeParse(raw);if(!result.success){failure=new HistoryError('invalid-data');stop();return}
    if(!result.data.ok){failure=new HistoryError(result.data.code);return}
    const {matches,partial,next}=result.data;page={matches,partial,next:next?this.seal(next,aad):null}
   })
   worker.once('error',()=>{finish(new HistoryError('unavailable'));stop()})
   worker.once('exit',code=>{clearTimeout(timer);signal.removeEventListener('abort',abort);this.workers.delete(worker);if(code!==0)finish(new HistoryError(this.stopping?'closed':'unavailable'));else if(failure)finish(failure);else finish(undefined,page)})
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
  })
 }
 /** @returns body-free operational status. */
 status():{readonly active:number;readonly stopping:boolean;readonly maintenance:boolean}{return{active:this.workers.size,stopping:Boolean(this.stopping),maintenance:this.maintenance}}
 /** @returns whether searches were idle and admission is now paused. */
 beginMaintenance():boolean{if(this.stopping||this.maintenance||this.workers.size)return false;this.maintenance=true;return true}
 /** Resume admission after a configuration attempt. */
 endMaintenance():void{this.maintenance=false}
 /** @returns completion after owned workers stop. */
 close():Promise<void>{
  if(this.stopping)return this.stopping
  this.stopping=Promise.resolve().then(async()=>{const workers=[...this.workers];const results=await Promise.allSettled(workers.map(worker=>worker.terminate()));const failures=results.filter(result=>result.status==='rejected');if(failures.length)throw new HistoryError('unavailable')})
  return this.stopping
 }
}
