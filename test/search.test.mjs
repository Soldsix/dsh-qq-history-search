import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir} from 'node:fs/promises'
import {resolve as absolute,join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import {identifier,scopeKey} from 'dsh-im-kit'
import {Context} from '@deepseek-ai/cordis'
import {resolve} from '../dist/config.js'
import {HistoryEngine} from '../dist/engine.js'
import * as plugin from '../dist/index.js'
const id=(domain,value)=>identifier(`im.${domain}`,value)
const account={tenantId:id('tenant','test-tenant'),networkId:id('network','onebot11'),accountId:id('account','test-account')}
const group=(name='group-a')=>({account,kind:'group',peerId:id('peer',name)})
const privateScope=(peer='alice')=>({account,kind:'private',peerId:id('peer',peer)})
const config=(directory,extra={})=>({enabled:true,directory,tenants:['test-tenant'],networks:['onebot11'],accounts:['test-account'],groups:['group-a','group-b'],privatePeers:['alice','bob'],operators:[{tenant:'test-tenant',network:'onebot11',account:'test-account',user:'admin'}],maxConcurrent:4,maxScan:2,maxScanBytes:16777216,maxResults:10,maxRecordBytes:4096,maxResultBytes:4096,timeoutMs:4000,...extra})
async function setup(extra={}){const root=absolute('.test-artifacts');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'history-'));await mkdir(join(dir,'scopes'));const spec=resolve(config(dir,extra),dir);assert.ok(spec);return{dir,spec,engine:new HistoryEngine(spec)}}
function pathFor(dir,scope){return join(dir,'scopes',createHash('sha256').update(scopeKey(scope)).digest('hex')+'.sqlite3')}
function createArchive(dir,scope,records){
 const db=new DatabaseSync(pathFor(dir,scope));db.exec('PRAGMA application_id=1146306898; PRAGMA user_version=1; CREATE TABLE archive_scope(id INTEGER PRIMARY KEY,scope_key TEXT NOT NULL); CREATE TABLE messages(message_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,input_json TEXT NOT NULL,received_at INTEGER NOT NULL); CREATE INDEX message_time ON messages(received_at,message_id)')
 db.prepare('INSERT INTO archive_scope VALUES(1,?)').run(scopeKey(scope))
 const insert=db.prepare('INSERT INTO messages VALUES(?,?,?,?)')
 for(const [n,sender,text] of records){const value={scope,messageId:id('message',`msg-${n}`),senderId:id('user',sender),sentAt:n,receivedAt:n,parts:[{type:'text',text}],directedToBot:false};insert.run(value.messageId,'synthetic',JSON.stringify(value),n)}db.close()
}
const request=(scope,requester='alice',extra={})=>({scope,requester:id('user',requester),query:'',limit:2,...extra})

test('disabled and unselected configuration opens no database',()=>{
 assert.equal(resolve(config('',{enabled:false}),''),null)
 assert.throws(()=>resolve(config(absolute('.'),{tenants:[]}),absolute('.')))
 assert.throws(()=>resolve(config(absolute('.'),{groups:[],privatePeers:[]}),absolute('.')))
})
test('normal user sees only own text and encrypted pages cannot be reused by another user',async()=>{
 const {dir,engine}=await setup();createArchive(dir,group(),[[1,'alice','alpha'],[2,'bob','private-bob'],[3,'alice','beta'],[4,'bob','also-bob'],[5,'alice','gamma']])
 const a=await engine.search(request(group()),new AbortController().signal);assert.deepEqual(a.matches.map(x=>x.text),['gamma']);assert.ok(a.next);assert.equal(a.partial,false)
 await assert.rejects(engine.search(request(group(),'bob',{before:a.next}),new AbortController().signal),error=>error.code==='invalid-data')
 await assert.rejects(engine.search(request(group(),'alice',{before:a.next,query:'different'}),new AbortController().signal),error=>error.code==='invalid-data')
 const b=await engine.search(request(group(),'alice',{before:a.next}),new AbortController().signal);assert.deepEqual(b.matches.map(x=>x.text),['beta']);assert.ok(b.next)
 const c=await engine.search(request(group(),'alice',{before:b.next}),new AbortController().signal);assert.deepEqual(c.matches.map(x=>x.text),['alpha']);assert.equal(c.next,null)
 assert.equal(JSON.stringify([a,b,c]).includes('private-bob'),false);await engine.close()
})
test('cross-sender, cross-account and private-scope checks reject before opening',async()=>{
 const {dir,engine}=await setup();createArchive(dir,group(),[[1,'bob','secret']])
 await assert.rejects(engine.search(request(group(),'alice',{sender:id('user','bob')}),new AbortController().signal),error=>error.code==='forbidden')
 await assert.rejects(engine.search(request(group(),'alice',{allSenders:true}),new AbortController().signal),error=>error.code==='forbidden')
 await assert.rejects(engine.search(request(privateScope('bob'),'alice'),new AbortController().signal),error=>error.code==='forbidden')
 const other={...group(),account:{...account,accountId:id('account','other-account')}}
 await assert.rejects(engine.search(request(other),new AbortController().signal),error=>error.code==='forbidden')
 const result=await engine.search(request(group(),'admin',{allSenders:true}),new AbortController().signal);assert.equal(result.matches[0].text,'secret');await engine.close()
})
test('operator authority is bound to exact tenant, network and bot account',async()=>{
 const {dir,engine}=await setup({accounts:['test-account','other-account']})
 const other={...group(),account:{...account,accountId:id('account','other-account')}};createArchive(dir,other,[[1,'bob','secret']])
 await assert.rejects(engine.search(request(other,'admin',{allSenders:true}),new AbortController().signal),error=>error.code==='forbidden');await engine.close()
})
test('query is exact Unicode substring and result limit never silently truncates a record',async()=>{
 const {dir,engine}=await setup({maxScan:10,maxResultBytes:1024});createArchive(dir,group(),[[1,'alice','鲸鲸\n测试'],[2,'alice','鲸'.repeat(900)]])
 const page=await engine.search(request(group(),'alice',{query:'鲸'}),new AbortController().signal);assert.equal(page.partial,true);assert.deepEqual(page.matches.map(x=>x.text),['鲸鲸\n测试']);assert.equal(page.next,null);await engine.close()
})
test('scan-byte limit pages without skipping an unread record',async()=>{
 const {dir,engine}=await setup({maxScan:10,maxScanBytes:1024});createArchive(dir,group(),[[1,'alice','a'.repeat(500)],[2,'alice','b'.repeat(500)]])
 const first=await engine.search(request(group()),new AbortController().signal);assert.deepEqual(first.matches.map(x=>x.messageId),['msg-2']);assert.ok(first.next)
 const second=await engine.search(request(group(),'alice',{before:first.next}),new AbortController().signal);assert.deepEqual(second.matches.map(x=>x.messageId),['msg-1']);assert.equal(second.next,null);await engine.close()
})
test('concurrency capacity prevents unbounded worker creation',async()=>{
 const {dir,engine}=await setup({maxConcurrent:1});createArchive(dir,group(),[[1,'alice','hello']])
 const first=engine.search(request(group()),new AbortController().signal)
 await assert.rejects(engine.search(request(group()),new AbortController().signal),error=>error.code==='capacity')
 assert.equal((await first).matches[0].text,'hello');assert.equal(engine.status().active,0);await engine.close()
})
test('multiple groups can be searched concurrently without cross-conversation results',async()=>{
 const {dir,engine}=await setup({groups:['group-a','group-b','group-c'],maxScan:100})
 for(const name of ['group-a','group-b','group-c'])createArchive(dir,group(name),Array.from({length:40},(_,n)=>[n+1,'alice',`${name}-message-${n+1}`]))
 const pages=await Promise.all(['group-a','group-b','group-c'].map(name=>engine.search(request(group(name),'alice',{query:name,limit:3}),new AbortController().signal)))
 for(const [index,name] of ['group-a','group-b','group-c'].entries()){assert.equal(pages[index].matches.length,3);assert.ok(pages[index].matches.every(item=>item.text.startsWith(name)))}
 await engine.close()
})
test('pagination cursor expires after restart and cannot cross groups',async()=>{
 const {dir,spec,engine}=await setup();createArchive(dir,group(),[[1,'alice','older'],[2,'alice','newer'],[3,'alice','newest']]);createArchive(dir,group('group-b'),[[1,'alice','other']])
 const first=await engine.search(request(group()),new AbortController().signal);assert.ok(first.next)
 await assert.rejects(engine.search(request(group('group-b'),'alice',{before:first.next}),new AbortController().signal),error=>error.code==='invalid-data')
 await engine.close();const next=new HistoryEngine(spec);await assert.rejects(next.search(request(group(),'alice',{before:first.next}),new AbortController().signal),error=>error.code==='invalid-data');await next.close()
})
test('missing or foreign databases fail visibly without creating or changing files',async()=>{
 const {dir,engine}=await setup();await assert.rejects(engine.search(request(group()),new AbortController().signal),error=>error.code==='missing')
 const db=new DatabaseSync(pathFor(dir,group()));db.exec("CREATE TABLE other(value TEXT); INSERT INTO other VALUES ('untouched')");db.close()
 await assert.rejects(engine.search(request(group()),new AbortController().signal),error=>error.code==='schema-unsupported')
 const check=new DatabaseSync(pathFor(dir,group()),{readOnly:true});assert.equal(check.prepare('SELECT value FROM other').get().value,'untouched');check.close();await engine.close()
})
test('cancellation and closure stop workers and reject new requests',async()=>{
 const {dir,engine}=await setup();createArchive(dir,group(),[[1,'alice','hello']]);const cancel=new AbortController(),task=engine.search(request(group()),cancel.signal);cancel.abort()
 await assert.rejects(task,error=>error.code==='cancelled');await engine.close();await assert.rejects(engine.search(request(group()),new AbortController().signal),error=>error.code==='closed')
})
test('Cordis provides only the host service and disposes its workers',async()=>{
 const {dir}=await setup();const ctx=new Context(),base=ctx.plugin({name:'synthetic-profile',apply(child){child.effect(()=>child.provide('profileContext',{dir}))}});await base.await()
 const fiber=ctx.plugin(plugin,plugin.Config(config(dir)));await fiber.await();assert.ok(ctx.qqHistorySearch);assert.equal(ctx.qqHistorySearch.status().active,0)
 await fiber.dispose();assert.equal(ctx.get('qqHistorySearch'),undefined);await base.dispose()
})
