/** Synthetic IM events exercise installed DSH archive and history bundles. */
import assert from 'node:assert/strict'
import {writeFile,readFile} from 'node:fs/promises'
import {setTimeout as delay} from 'node:timers/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {dirname,resolve} from 'node:path'
const require=createRequire(import.meta.url),owner=createRequire(require.resolve('dsh-qq-archive/package.json')),kit=owner.resolve('dsh-im-kit/package.json'),metadata=JSON.parse(await readFile(kit,'utf8'))
const {identifier,ImRuntime}=await import(pathToFileURL(resolve(dirname(kit),metadata.main)).href)
export const name='synthetic-history-fixture'
export function apply(ctx,config){
 const im=new ImRuntime();ctx.effect(()=>ctx.provide('im',im));ctx.effect(()=>()=>im.close())
 ctx.inject(['qqHistoryControl','sdkSessionActivation','typertGateway','remoteAccess'],child=>{const task=probe(child,config);child.effect(()=>async()=>{await task})})
}
async function probe(ctx,config){
 const checks=[],id=(domain,value)=>identifier(`im.${domain}`,value)
 try{
  const deadline=Date.now()+15000;while(!ctx.get('qqArchive')?.status().attached||!ctx.get('qqHistorySearch')){assert.ok(Date.now()<deadline);await delay(20)}
  const scope={account:{tenantId:id('tenant','tenant-a'),networkId:id('network','onebot11'),accountId:id('account','account-a')},kind:'group',peerId:id('peer','group-a')}
  const event=(n,sender,text)=>({scope,messageId:id('message',n),senderId:id('user',sender),sentAt:100,receivedAt:100,parts:[{type:'text',text}],directedToBot:false})
  assert.deepEqual(await ctx.im.publish(event('one','alice','whale apple')),{accepted:1,failed:0});assert.deepEqual(await ctx.im.publish(event('two','bob','whale banana')),{accepted:1,failed:0})
  const signal=new AbortController().signal,request={scope,requester:id('user','alice'),query:'whale',limit:10}
  const self=await ctx.get('qqHistorySearch').search(request,signal);assert.deepEqual(self.matches.map(item=>item.text),['whale apple'])
  await assert.rejects(ctx.get('qqHistorySearch').search({...request,sender:id('user','bob')},signal),error=>error.code==='forbidden')
  checks.push('trusted-requester-sees-only-own-history')
  const admin=await ctx.get('qqHistorySearch').search({...request,requester:id('user','admin'),allSenders:true},signal);assert.equal(admin.matches.length,2);checks.push('explicit-operator-sees-configured-scope')
  const cursor=(await ctx.get('qqHistorySearch').search({...request,requester:id('user','admin'),allSenders:true,limit:1},signal)).next;assert.ok(cursor)
  const control=ctx.qqHistoryControl,state=await control.describe();assert.equal(state.active,true)
  ctx.effect(()=>ctx.remoteAccess.registerPolicy('history-test-guest',{bindings:()=>[{resource:{kind:'global'},role:{name:'history-qa',resource:'global',actions:['qqHistoryControl/describe','qqHistoryControl/save']}}]}))
  const guest={id:'history-test-guest',ctx,principal:{kind:'history-test-guest'},signal:new AbortController().signal,interactions:'none',async dispose(){}}
  for(const [method,args] of [['describe',{}],['save',{request:{revision:state.revision,patch:{maxScan:100}}}]])await assert.rejects(ctx.typertGateway.invoke({namespace:'qqHistoryControl',method,args,peer:guest,signal:guest.signal}),error=>error.code==='qq-history/control'&&error.details.reason==='forbidden')
  checks.push('guest-cannot-read-or-edit-settings')
  const old=ctx.get('qqHistorySearch');assert.equal(old.beginMaintenance(),true)
  await assert.rejects(control.save({revision:state.revision,patch:{maxScan:100}}),error=>error.details?.reason==='busy');old.endMaintenance()
  const changed=await control.save({revision:state.revision,patch:{maxScan:100}});assert.equal(changed.config.maxScan,100)
  const ready=Date.now()+15000;while(!ctx.get('qqHistorySearch')){assert.ok(Date.now()<ready);await delay(20)}
  assert.deepEqual((await ctx.get('qqHistorySearch').search(request,signal)).matches.map(item=>item.text),['whale apple'])
  await assert.rejects(ctx.get('qqHistorySearch').search({...request,requester:id('user','admin'),allSenders:true,limit:1,before:cursor},signal),error=>error.code==='invalid-data');checks.push('idle-config-reload-retains-archive-and-expires-cursors')
  await writeFile(config.resultPath,JSON.stringify({passed:true,checks,realQqMessagesSent:0})+'\n')
 }catch(error){await writeFile(config.resultPath,JSON.stringify({passed:false,checks,error:{message:error.message},realQqMessagesSent:0})+'\n')}
}
