import test from 'node:test'
import assert from 'node:assert/strict'
import {scheduler} from 'node:timers/promises'
import {brandString} from '@deepseek-ai/dsh-brand'
import {identifier,scopeKey} from 'dsh-im-kit'
import {RequestAuthority} from 'dsh-im-requests'
import {assertSupportedJsonSchema,validateJsonSchemaValue} from '@deepseek-ai/dsh-tools'
import {Config,resolve} from '../dist/config.js'
import {HistoryEngine} from '../dist/engine.js'
import {HistoryError} from '../dist/wire.js'
import {HistoryModelTool} from '../dist/model-tool.js'
const id=(kind,value)=>identifier('im.'+kind,value)
const scope=(peer='room')=>({account:{tenantId:id('tenant','tenant'),networkId:id('network','network'),accountId:id('account','bot')},kind:'group',peerId:id('peer',peer)})
const settings={enabled:true,toolsEnabled:true,tenants:['tenant'],networks:['network'],accounts:['bot'],groups:['room'],operators:[{tenant:'tenant',network:'network',account:'bot',user:'admin'}]}
const spec=extra=>resolve(Config({...settings,...extra}),process.cwd())
function fixture(t,{mode='sender',options={},backend}={}){
 const requests=new RequestAuthority(mode),reads=[],rows=[['a1','alice','A_CANARY first'],['a2','alice','A_CANARY second'],['b1','bob','B_CANARY private'],['other','alice','OTHER_GROUP_CANARY']].map(([messageId,sender,text],index)=>({scope:scope(index===3?'other':'room'),messageId:id('message',messageId),sender:id('user',sender),text,receivedAt:10+index,sentAt:10+index,hasNonText:false}))
 const archive={async read(query,signal){reads.push(query);if(backend)return backend(query,signal);const matches=rows.filter(row=>scopeKey(row.scope)===scopeKey(query.scope)&&(query.sender===null||query.sender===row.sender)&&row.text.includes(query.query)).map(({scope,...row})=>row);return{matches:matches.slice(0,query.limit),partial:false,next:matches.length>query.limit?{receivedAt:10,messageId:id('message','a1')}:null}}}
 const config=spec(options),history=new HistoryEngine(config,archive),adapter=new HistoryModelTool(config,history,requests.service),definition=adapter.definition()
 t.after(async()=>{await adapter.close();await history.close();requests.close()})
 function bind(sender='alice',peer='room',owner={}){const lease=requests.open(owner,{id:brandString('request-'+sender),scope:scope(peer),senderId:id('user',sender),messageId:id('message','source-'+sender)},new AbortController().signal);lease.activate();return{owner,lease,exec:{agent:owner,signal:new AbortController().signal}}}
 return{requests,history,adapter,definition,reads,bind}
}
test('native schemas and presenters accept only canonical bounded responses',async t=>{
 const f=fixture(t),a=f.bind();assertSupportedJsonSchema(f.definition.output.schema);assertSupportedJsonSchema(f.definition.parameters)
 const result=await f.definition.execute({query:'CANARY'},a.exec)
 assert.equal(result.status,'ok');assert.deepEqual(result.matches.map(x=>x.sender),['alice','alice']);assert.equal(validateJsonSchemaValue(f.definition.output.schema,result).length,0)
 assert.equal(f.definition.presentCall({query:'needle'}).kind,'search');assert.equal(f.definition.presentCall({requester:'forged'}),undefined)
 assert.equal(f.definition.presentResult({}, {isError:true,content:[]}).title,'History search failed')
 assert.match(f.definition.output.render({},result)[0].text,/untrusted data/);assert.equal(f.adapter.available(a.owner),true)
})
test('scope, requester, account and execution owner cannot be selected by model JSON',async t=>{
 const f=fixture(t),a=f.bind()
 for(const args of [{query:'',scope:scope('other')},{query:'',requester:'admin'},{query:'',account:'another'},{query:'',agent:a.owner},{query:'',limit:99}]){
  assert.equal((await f.definition.execute(args,a.exec)).reason,'invalid-arguments');assert.equal(f.reads.length,0)
 }
 assert.equal((await f.definition.execute({query:'',allSenders:true},a.exec)).reason,'forbidden');assert.equal(f.reads.length,0)
 assert.equal((await f.definition.execute({query:'',sender:'bob'},a.exec)).reason,'forbidden');assert.equal(f.reads.length,0)
 assert.equal((await f.definition.execute({query:''},{signal:a.exec.signal})).reason,'unbound-request')
 assert.equal((await f.definition.execute({query:''},{...a.exec,agent:{id:a.owner.id}})).reason,'unbound-request');assert.equal(f.adapter.available({}),false)
 const foreign=f.bind('alice','other');assert.equal(f.adapter.available(foreign.owner),false);assert.equal((await f.definition.execute({query:''},foreign.exec)).reason,'forbidden');assert.equal(f.reads.length,0)
})
test('operator reads stay inside the current authenticated conversation',async t=>{
 const f=fixture(t),admin=f.bind('admin'),result=await f.definition.execute({query:'CANARY',allSenders:true},admin.exec)
 assert.deepEqual(result.matches.map(x=>x.sender),['alice','alice','bob']);assert.equal(JSON.stringify(result).includes('OTHER_GROUP_CANARY'),false)
 assert.equal(f.reads.length,1);assert.equal(f.reads[0].sender,null);assert.equal(f.reads[0].scope.peerId,'room')
 assert.equal((await f.definition.execute({query:'',sender:'bob',allSenders:true},admin.exec)).reason,'forbidden')
})
test('shared group Sessions refuse private history instead of caching it for the next member',async t=>{
 const f=fixture(t,{mode:'shared'}),a=f.bind();assert.equal(f.adapter.available(a.owner),false)
 assert.equal((await f.definition.execute({query:'CANARY'},a.exec)).reason,'sender-isolation-required');assert.equal(f.reads.length,0)
})
test('pagination cannot cross requester identities even within the same group',async t=>{
 const f=fixture(t),a=f.bind(),first=await f.definition.execute({query:'CANARY',limit:1},a.exec);assert.ok(first.next)
 a.lease.close();const b=f.bind('bob'),before=f.reads.length
 assert.equal((await f.definition.execute({query:'CANARY',limit:1,before:first.next},b.exec)).reason,'invalid-arguments');assert.equal(f.reads.length,before)
})
test('text budgets preserve well-formed Unicode and expose truncation without replacing archive records',async t=>{
 const original='😀鲸'.repeat(100),f=fixture(t,{options:{toolTextChars:100,toolMatchChars:50},backend:async()=>({matches:[{messageId:id('message','unicode'),sender:id('user','alice'),text:original,receivedAt:1,sentAt:1,hasNonText:true}],partial:false,next:null})}),a=f.bind()
 const result=await f.definition.execute({query:''},a.exec);assert.equal(result.partial,true);assert.equal(result.matches[0].truncated,true);assert.ok(result.matches[0].text.length<=50);assert.ok(!/\p{Surrogate}/u.test(result.matches[0].text));assert.equal(original.length,300)
})
test('revocation and teardown join late work and discard its data before returning',async t=>{
 let enter,release,signal;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve)
 const f=fixture(t,{backend:async(_request,active)=>{signal=active;enter();await gate;return{matches:[{messageId:id('message','late'),sender:id('user','alice'),text:'LATE_PRIVATE_CANARY',receivedAt:1,sentAt:1,hasNonText:false}],partial:false,next:null}}}),a=f.bind(),pending=f.definition.execute({query:''},a.exec)
 t.after(()=>release());await entered;a.lease.close();assert.equal(signal.aborted,true);let closed=false;const closing=f.adapter.close().then(()=>{closed=true});await scheduler.yield();assert.equal(closed,false)
 release();const result=await pending;assert.equal(result.reason,'request-ended');assert.equal(JSON.stringify(result).includes('LATE_PRIVATE_CANARY'),false);await closing;assert.equal(f.adapter.status().active,0)
 assert.equal((await f.definition.execute({query:''},a.exec)).reason,'request-ended')
})
test('expected infrastructure errors and unknown failures never expose private diagnostics',async t=>{
 for(const failure of [new HistoryError('capacity'),new Error('SECRET_BACKEND_PATH')]){
  const f=fixture(t,{backend:async()=>{throw failure}}),a=f.bind();await assert.rejects(f.definition.execute({query:''},a.exec),error=>error.message.startsWith('QQ_HISTORY_')&&!error.message.includes('SECRET'))
 }
})
