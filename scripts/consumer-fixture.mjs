/** Synthetic archive-and-search composition in a fresh consumer. */
import assert from 'node:assert/strict'
import {mkdtemp,readFile} from 'node:fs/promises'
import {join,resolve,dirname} from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
const require=createRequire(import.meta.url),owner=createRequire(require.resolve('dsh-qq-archive/package.json')),kit=owner.resolve('dsh-im-kit/package.json'),metadata=JSON.parse(await readFile(kit,'utf8'))
const {identifier,ImRuntime}=await import(pathToFileURL(resolve(dirname(kit),metadata.main)).href)
import * as archive from 'dsh-qq-archive'
import * as history from 'dsh-qq-history-search'
const dir=await mkdtemp(join(resolve('.'),'synthetic-composition-')),ctx=new Context(),im=new ImRuntime(),id=(domain,value)=>identifier(`im.${domain}`,value)
const account={tenantId:id('tenant','tenant-a'),networkId:id('network','onebot11'),accountId:id('account','account-a')}
const scope={account,kind:'group',peerId:id('peer','group-a')},source=(message,sender,text)=>({scope,messageId:id('message',message),senderId:id('user',sender),sentAt:100,receivedAt:100,parts:[{type:'text',text}],directedToBot:false})
const selection={enabled:true,tenants:['tenant-a'],networks:['onebot11'],accounts:['account-a'],groups:['group-a']}
const service=ctx.plugin({name:'synthetic-profile',apply(child){child.effect(()=>child.provide('profileContext',{dir}));child.effect(()=>child.provide('im',im))}});await service.await()
const af=ctx.plugin(archive,archive.Config({...selection,readEnabled:true}));await af.await()
const hf=ctx.plugin(history,history.Config({...selection,operators:[{tenant:'tenant-a',network:'onebot11',account:'account-a',user:'admin'}]}));await hf.await()
assert.deepEqual(await im.publish(source('one','alice','whale apple')),{accepted:1,failed:0})
assert.deepEqual(await im.publish(source('two','bob','whale banana')),{accepted:1,failed:0})
const signal=new AbortController().signal,query={scope,requester:id('user','alice'),query:'whale',limit:10}
const self=await ctx.qqHistorySearch.search(query,signal);assert.deepEqual(self.matches.map(item=>item.text),['whale apple'])
await assert.rejects(ctx.qqHistorySearch.search({...query,sender:id('user','bob')},signal),error=>error.code==='forbidden')
const admin=await ctx.qqHistorySearch.search({...query,requester:id('user','admin'),allSenders:true},signal);assert.equal(admin.matches.length,2)
const writing=Array.from({length:12},(_,n)=>im.publish(source(`parallel-${n}`,'alice',`whale alice-${n}`)))
const reading=Array.from({length:3},()=>ctx.qqHistorySearch.search(query,signal))
const [receipts,pages]=await Promise.all([Promise.all(writing),Promise.all(reading)])
assert.ok(receipts.every(result=>result.accepted===1&&result.failed===0));assert.ok(pages.every(page=>page.matches.every(item=>item.sender==='alice')))
await hf.dispose();await af.dispose();await service.dispose();await im.close()
console.log(JSON.stringify({passed:true,stored:14,selfMatches:1,otherDenied:true,adminMatches:2,parallelWrites:12,parallelSearches:3,realQqMessagesSent:0}))
