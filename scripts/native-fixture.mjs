/** Synthetic IM events exercise installed DSH archive and history bundles. */
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {setTimeout as delay} from 'node:timers/promises'
import {identifier,ImRuntime} from 'dsh-im-kit'
export const name='synthetic-history-fixture'
export function apply(ctx,config){
 const im=new ImRuntime();ctx.effect(()=>ctx.provide('im',im));ctx.effect(()=>()=>im.close())
 ctx.inject(['qqArchive','qqHistorySearch','sdkSessionActivation'],child=>{const task=probe(child,config);child.effect(()=>async()=>{await task})})
}
async function probe(ctx,config){
 const checks=[],id=(domain,value)=>identifier(`im.${domain}`,value)
 try{
  const deadline=Date.now()+15000;while(!ctx.get('qqArchive')?.status().attached||!ctx.get('qqHistorySearch')){assert.ok(Date.now()<deadline);await delay(20)}
  const scope={account:{tenantId:id('tenant','tenant-a'),networkId:id('network','onebot11'),accountId:id('account','account-a')},kind:'group',peerId:id('peer','group-a')}
  const event=(n,sender,text)=>({scope,messageId:id('message',n),senderId:id('user',sender),sentAt:100,receivedAt:100,parts:[{type:'text',text}],directedToBot:false})
  assert.deepEqual(await ctx.im.publish(event('one','alice','whale apple')),{accepted:1,failed:0});assert.deepEqual(await ctx.im.publish(event('two','bob','whale banana')),{accepted:1,failed:0})
  const signal=new AbortController().signal,request={scope,requester:id('user','alice'),query:'whale',limit:10}
  const self=await ctx.qqHistorySearch.search(request,signal);assert.deepEqual(self.matches.map(item=>item.text),['whale apple'])
  await assert.rejects(ctx.qqHistorySearch.search({...request,sender:id('user','bob')},signal),error=>error.code==='forbidden')
  checks.push('trusted-requester-sees-only-own-history')
  const admin=await ctx.qqHistorySearch.search({...request,requester:id('user','admin'),allSenders:true},signal);assert.equal(admin.matches.length,2);checks.push('explicit-operator-sees-configured-scope')
  await writeFile(config.resultPath,JSON.stringify({passed:true,checks,realQqMessagesSent:0})+'\n')
 }catch(error){await writeFile(config.resultPath,JSON.stringify({passed:false,checks,error:{message:error.message},realQqMessagesSent:0})+'\n')}
}
