/** Synthetic native chat/archive/tool composition; it connects to no messaging platform. */
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {setImmediate as nextTurn,setTimeout as delay} from 'node:timers/promises'
import {ImRuntime,identifier} from 'dsh-im-kit'
export const name='history-model-fixture'
export function apply(ctx,config){
 const im=new ImRuntime(),outputs=[],id=(domain,value)=>identifier('im.'+domain,value),lifetime=new AbortController()
 const account={tenantId:id('tenant','fixture'),networkId:id('network','onebot11'),accountId:id('account','bot')}
 ctx.effect(()=>()=>im.close());ctx.effect(()=>ctx.provide('im',im))
 ctx.effect(()=>im.register({account,async availability(){return'available'},async send(value){outputs.push(structuredClone(value));return{status:'accepted',messageIds:[]}},async dispose(){}}))
 ctx.inject(['configEditor','tools','sdkSessionActivation'],child=>{
  const work=probe(child);child.effect(()=>async()=>{lifetime.abort();await work})
 })
 async function probe(owner){
  const checks=[],events=[],diagnostics=[]
  const service=name=>{const value=owner.get(name);assert.ok(value,'Missing fixture service '+name);return value}
  owner.on('session/event',(_session,event)=>{if(event.type==='tool/result')events.push(event)})
  owner.on('qq-chat/diagnostic',({stage,error})=>diagnostics.push({stage,message:error?.message}))
  const scope=peer=>({account,kind:'group',peerId:id('peer',peer)})
  let serial=0
  const send=async(sender,text,peer='room',directed=true)=>{const now=Date.now(),source={scope:scope(peer),senderId:id('user',sender),messageId:id('message','model-'+(++serial)),receivedAt:now,sentAt:now,directedToBot:directed,parts:[{type:'text',text}]};const value=await im.publish(source,lifetime.signal);assert.equal(value.failed,0,JSON.stringify(diagnostics));assert.ok(value.accepted>=2);return source}
  try{
   await nextTurn()
   const until=Date.now()+15000
   while(!owner.get('qqArchive')?.status().attached||!owner.get('qqChat')?.status().transportAttached||!owner.get('qqHistoryModelTool')){assert.ok(Date.now()<until,'Native consumers did not attach');await delay(20,undefined,{signal:lifetime.signal})}
   assert.equal((await service('qqHistoryControl').describe()).toolState,'registered')
   await send('alice','ALLOW_A_CANARY','room',false);await send('bob','ALLOW_B_CANARY','room',false);await send('alice','ALLOW_OTHER_ROOM_CANARY','room-two',false)
   assert.equal(outputs.length,0);checks.push('archive-ingests-unaddressed-sources-without-model-replies')
   for(const [sender,text]of [['alice','HISTORY_NATIVE_OWN_A'],['bob','HISTORY_NATIVE_OWN_B'],['alice','HISTORY_NATIVE_OTHER_SENDER'],['alice','HISTORY_NATIVE_ALL_SENDERS'],['alice','HISTORY_NATIVE_FORGED_REQUESTER'],['admin','HISTORY_NATIVE_ADMIN'],['alice','HISTORY_NATIVE_A_AGAIN']])await send(sender,text)
   assert.equal(outputs.length,7,JSON.stringify(diagnostics));checks.push('native-tool-calls-bind-real-source-and-reject-model-selected-identity')
   await Promise.all([send('alice','HISTORY_NATIVE_PARALLEL_A'),send('admin','HISTORY_NATIVE_PARALLEL_OTHER','room-two')])
   assert.equal(outputs.length,9);assert.equal(service('imRequests').status().active,0);checks.push('parallel-groups-and-senders-do-not-share-model-history')
   const preview=await service('qqChat').preview('HISTORY_NATIVE_PREVIEW',lifetime.signal);assert.equal(preview.result.status,'previewed');assert.equal(outputs.length,9);checks.push('preview-cannot-activate-history-tool-or-send')
   const entry=owner.configEditor.entries().find(item=>item.options.id==='qq-chat-runtime');assert.ok(entry)
   await owner.configEditor.edit(entry,raw=>({...raw,isolateGroupSenders:false}))
   assert.equal(owner.get('qqHistoryModelTool'),undefined)
   assert.equal((await service('qqHistoryControl').describe()).toolState,'sender-isolation-required')
   await send('alice','HISTORY_NATIVE_SHARED');assert.equal(outputs.length,10);checks.push('shared-session-reload-unregisters-tool-before-new-model-request')
   await owner.configEditor.edit(entry,raw=>({...raw,isolateGroupSenders:true}))
   const ready=Date.now()+10000;while(!owner.get('qqHistoryModelTool')){assert.ok(Date.now()<ready);await delay(20)}
   await send('bob','HISTORY_NATIVE_RESTORED');assert.equal(outputs.length,11);assert.equal(service('imRequests').status().active,0)
   assert.ok(events.length>=10,'Native tool results were not recorded as Session events')
   assert.ok(!service('qqHistoryModelTool').available({id:'forged-agent'}));checks.push('restored-isolation-retains-records-and-logs-canonical-tool-results')
   const result={passed:true,checks,outputs:outputs.length,toolResultEvents:events.length,realModelApiRequests:0,realQqMessagesSent:0}
   await writeFile(config.resultPath,JSON.stringify(result,null,2)+'\n')
  }catch(error){await writeFile(config.resultPath,JSON.stringify({passed:false,checks,error:{message:error.message,stack:error.stack},diagnostics},null,2)+'\n')}
 }
}
