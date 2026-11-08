import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,stat} from 'node:fs/promises'
import {resolve as absolute,join} from 'node:path'
import {identifier,ImRuntime} from 'dsh-im-kit'
import * as archivePlugin from 'dsh-qq-archive'
import {Context} from '@deepseek-ai/cordis'
import {resolve} from '../dist/config.js'
import {HistoryEngine} from '../dist/engine.js'
import * as plugin from '../dist/index.js'
const id=(domain,value)=>identifier(`im.${domain}`,value)
const account={tenantId:id('tenant','test-tenant'),networkId:id('network','onebot11'),accountId:id('account','test-account')}
const group=(name='group-a')=>({account,kind:'group',peerId:id('peer',name)})
const privateScope=(peer='alice')=>({account,kind:'private',peerId:id('peer',peer)})
const config=(directory,extra={})=>({enabled:true,tenants:['test-tenant'],networks:['onebot11'],accounts:['test-account'],groups:['group-a','group-b'],privatePeers:['alice','bob'],operators:[{tenant:'test-tenant',network:'onebot11',account:'test-account',user:'admin'}],maxConcurrent:4,maxScan:2,maxScanBytes:16777216,maxResults:10,maxRecordBytes:4096,maxResultBytes:4096,timeoutMs:4000,...extra})
async function setup(t,extra={}){
 const root=absolute('.test-artifacts');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'history-'))
 const spec=resolve(config(dir,extra),dir);assert.ok(spec)
 const ctx=new Context(),im=new ImRuntime(),base=ctx.plugin({name:'archive-test-services',apply(child){child.effect(()=>child.provide('profileContext',{dir}));child.effect(()=>child.provide('im',im))}});await base.await()
 const archiveFiber=ctx.plugin(archivePlugin,archivePlugin.Config({enabled:true,readEnabled:true,directory:dir,tenants:['test-tenant'],accounts:['test-account','other-account'],groups:['group-a','group-b','group-c'],privatePeers:['alice','bob']}));await archiveFiber.await()
 const archive=ctx.qqArchive,engine=new HistoryEngine(spec,archive)
 t.after(async()=>{await engine.close();await archiveFiber.dispose();await base.dispose();await im.close()})
 async function seed(scope,records){for(const [n,sender,text] of records){const event={scope,messageId:id('message',`msg-${n}`),senderId:id('user',sender),sentAt:n,receivedAt:n,parts:[{type:'text',text}],directedToBot:false};assert.deepEqual(await im.publish(event),{accepted:1,failed:0})}}
 return{dir,spec,engine,archive,seed}
}
const request=(scope,requester='alice',extra={})=>({scope,requester:id('user',requester),query:'',limit:2,...extra})

test('disabled and unselected configuration opens no database',()=>{
 assert.equal(resolve(config('',{enabled:false}),''),null)
 assert.throws(()=>resolve(config(absolute('.'),{tenants:[]}),absolute('.')))
 assert.throws(()=>resolve(config(absolute('.'),{groups:[],privatePeers:[]}),absolute('.')))
})
test('normal user sees only own text and encrypted pages cannot be reused by another user',async t=>{
 const {dir,seed,engine}=await setup(t);await seed(group(),[[1,'alice','alpha'],[2,'bob','private-bob'],[3,'alice','beta'],[4,'bob','also-bob'],[5,'alice','gamma']])
 const a=await engine.search(request(group()),new AbortController().signal);assert.deepEqual(a.matches.map(x=>x.text),['gamma']);assert.ok(a.next);assert.equal(a.partial,false)
 await assert.rejects(engine.search(request(group(),'bob',{before:a.next}),new AbortController().signal),error=>error.code==='invalid-data')
 await assert.rejects(engine.search(request(group(),'alice',{before:a.next,query:'different'}),new AbortController().signal),error=>error.code==='invalid-data')
 const b=await engine.search(request(group(),'alice',{before:a.next}),new AbortController().signal);assert.deepEqual(b.matches.map(x=>x.text),['beta']);assert.ok(b.next)
 const c=await engine.search(request(group(),'alice',{before:b.next}),new AbortController().signal);assert.deepEqual(c.matches.map(x=>x.text),['alpha']);assert.equal(c.next,null)
 assert.equal(JSON.stringify([a,b,c]).includes('private-bob'),false);await engine.close()
})
test('cross-sender, cross-account and private-scope checks reject before opening',async t=>{
 const {dir,seed,engine}=await setup(t);await seed(group(),[[1,'bob','secret']])
 await assert.rejects(engine.search(request(group(),'alice',{sender:id('user','bob')}),new AbortController().signal),error=>error.code==='forbidden')
 await assert.rejects(engine.search(request(group(),'alice',{allSenders:true}),new AbortController().signal),error=>error.code==='forbidden')
 await assert.rejects(engine.search(request(privateScope('bob'),'alice'),new AbortController().signal),error=>error.code==='forbidden')
 const other={...group(),account:{...account,accountId:id('account','other-account')}}
 await assert.rejects(engine.search(request(other),new AbortController().signal),error=>error.code==='forbidden')
 const result=await engine.search(request(group(),'admin',{allSenders:true}),new AbortController().signal);assert.equal(result.matches[0].text,'secret');await engine.close()
})
test('operator authority is bound to exact tenant, network and bot account',async t=>{
 const {dir,seed,engine}=await setup(t,{accounts:['test-account','other-account']})
 const other={...group(),account:{...account,accountId:id('account','other-account')}};await seed(other,[[1,'bob','secret']])
 await assert.rejects(engine.search(request(other,'admin',{allSenders:true}),new AbortController().signal),error=>error.code==='forbidden');await engine.close()
})
test('query is exact Unicode substring and result limit never silently truncates a record',async t=>{
 const {dir,seed,engine}=await setup(t,{maxScan:10,maxResultBytes:1024});await seed(group(),[[1,'alice','鲸鲸\n测试'],[2,'alice','鲸'.repeat(900)]])
 const page=await engine.search(request(group(),'alice',{query:'鲸'}),new AbortController().signal);assert.equal(page.partial,true);assert.deepEqual(page.matches.map(x=>x.text),['鲸鲸\n测试']);assert.equal(page.next,null);await engine.close()
})
test('scan-byte limit pages without skipping an unread record',async t=>{
 const {dir,seed,engine}=await setup(t,{maxScan:10,maxScanBytes:1024});await seed(group(),[[1,'alice','a'.repeat(500)],[2,'alice','b'.repeat(500)]])
 const first=await engine.search(request(group()),new AbortController().signal);assert.deepEqual(first.matches.map(x=>x.messageId),['msg-2']);assert.ok(first.next)
 const second=await engine.search(request(group(),'alice',{before:first.next}),new AbortController().signal);assert.deepEqual(second.matches.map(x=>x.messageId),['msg-1']);assert.equal(second.next,null);await engine.close()
})
test('concurrency capacity prevents unbounded worker creation',async t=>{
 const {dir,seed,engine}=await setup(t,{maxConcurrent:1});await seed(group(),[[1,'alice','hello']])
 const first=engine.search(request(group()),new AbortController().signal)
 await assert.rejects(engine.search(request(group()),new AbortController().signal),error=>error.code==='capacity')
 assert.equal((await first).matches[0].text,'hello');assert.equal(engine.status().active,0);await engine.close()
})
test('maintenance refuses active searches and blocks new admission until released',async t=>{
 const {dir,seed,engine}=await setup(t);await seed(group(),[[1,'alice','hello']]);const signal=new AbortController().signal
 const pending=engine.search(request(group()),signal);assert.equal(engine.beginMaintenance(),false);await pending
 assert.equal(engine.beginMaintenance(),true);assert.equal(engine.beginMaintenance(),false)
 await assert.rejects(engine.search(request(group()),signal),error=>error.code==='busy')
 engine.endMaintenance();assert.equal((await engine.search(request(group()),signal)).matches[0].text,'hello')
 await engine.close();assert.equal(engine.beginMaintenance(),false)
})
test('multiple groups can be searched concurrently without cross-conversation results',async t=>{
 const {dir,seed,engine}=await setup(t,{groups:['group-a','group-b','group-c'],maxScan:100})
 for(const name of ['group-a','group-b','group-c'])await seed(group(name),Array.from({length:40},(_,n)=>[n+1,'alice',`${name}-message-${n+1}`]))
 const pages=await Promise.all(['group-a','group-b','group-c'].map(name=>engine.search(request(group(name),'alice',{query:name,limit:3}),new AbortController().signal)))
 for(const [index,name] of ['group-a','group-b','group-c'].entries()){assert.equal(pages[index].matches.length,3);assert.ok(pages[index].matches.every(item=>item.text.startsWith(name)))}
 await engine.close()
})
test('pagination cursor expires after restart and cannot cross groups',async t=>{
 const {dir,spec,archive,seed,engine}=await setup(t);await seed(group(),[[1,'alice','older'],[2,'alice','newer'],[3,'alice','newest']]);await seed(group('group-b'),[[1,'alice','other']])
 const first=await engine.search(request(group()),new AbortController().signal);assert.ok(first.next)
 await assert.rejects(engine.search(request(group('group-b'),'alice',{before:first.next}),new AbortController().signal),error=>error.code==='invalid-data')
 await engine.close();const next=new HistoryEngine(spec,archive);await assert.rejects(next.search(request(group(),'alice',{before:first.next}),new AbortController().signal),error=>error.code==='invalid-data');await next.close()
})
test('missing archives propagate the owner error without opening storage in the consumer',async t=>{
 const {engine}=await setup(t);await assert.rejects(engine.search(request(group()),new AbortController().signal),error=>error.code==='missing')
})
test('cancellation and closure stop workers and reject new requests',async t=>{
 const {dir,seed,engine}=await setup(t);await seed(group(),[[1,'alice','hello']]);const cancel=new AbortController(),task=engine.search(request(group()),cancel.signal);cancel.abort()
 await assert.rejects(task,error=>error.code==='cancelled');await engine.close();await assert.rejects(engine.search(request(group()),new AbortController().signal),error=>error.code==='closed')
})
test('Cordis provides only the host service and disposes its workers',async t=>{
 const {dir,archive}=await setup(t);const ctx=new Context(),base=ctx.plugin({name:'synthetic-profile',apply(child){child.effect(()=>child.provide('profileContext',{dir}));child.effect(()=>child.provide('qqArchive',archive))}});await base.await()
 const fiber=ctx.plugin(plugin,plugin.Config(config(dir)));await fiber.await();assert.ok(ctx.qqHistorySearch);assert.equal(ctx.qqHistorySearch.status().active,0)
 await fiber.dispose();assert.equal(ctx.get('qqHistorySearch'),undefined);await base.dispose()
})
test('disabled Cordis plugin does not create a directory or register a service',async t=>{
 const root=absolute('.test-artifacts');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'disabled-')),target=join(dir,'never-created')
 const ctx=new Context(),base=ctx.plugin({name:'synthetic-disabled-profile',apply(child){child.effect(()=>child.provide('profileContext',{dir}))}});await base.await()
 const fiber=ctx.plugin(plugin,plugin.Config({enabled:false}));await fiber.await();assert.equal(ctx.get('qqHistorySearch'),undefined)
 await assert.rejects(stat(target),error=>error.code==='ENOENT');await fiber.dispose();await base.dispose()
})

test('history close cancels only its own reads and waits for the provider to acknowledge disposal',async()=>{
 const spec=resolve(config(absolute('.')),absolute('.'));let entered,release,observedSignal,calls=0
 const started=new Promise(resolve=>{entered=resolve}),released=new Promise(resolve=>{release=resolve})
 const archive={async read(input,signal){calls++;observedSignal=signal;entered();await released;return{matches:[],partial:false,next:null}}}
 const engine=new HistoryEngine(spec,archive),other=new HistoryEngine(spec,archive)
 const task=engine.search(request(group()),new AbortController().signal),rejected=assert.rejects(task,error=>error.code==='closed')
 await started;let closed=false;const closing=engine.close().then(()=>{closed=true});await Promise.resolve();await Promise.resolve()
 assert.equal(observedSignal.aborted,true);assert.equal(closed,false);assert.equal(engine.status().active,1)
 release();await Promise.all([closing,rejected]);assert.equal(engine.status().active,0)
 assert.deepEqual((await other.search(request(group()),new AbortController().signal)).matches,[]);assert.equal(calls,2);await other.close()
})
test('unauthorized requests never call the archive service',async()=>{
 const spec=resolve(config(absolute('.')),absolute('.'));let called=0
 const engine=new HistoryEngine(spec,{async read(){called++;throw Error('should not reach storage')}})
 await assert.rejects(engine.search(request(group(),'alice',{allSenders:true}),new AbortController().signal),error=>error.code==='forbidden')
 assert.equal(called,0);await engine.close()
})
