import test from 'node:test'
import assert from 'node:assert/strict'
import {resolve as absolute} from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import Control,{Config as ControlConfig} from '../dist/control.js'
import {Config} from '../dist/config.js'
import {saveSchema,snapshotSchema} from '../dist/control-codecs.js'
import {RequestAuthority} from 'dsh-im-requests'

async function mount(t,{service,editFailure=false,enabled=false,requests}={}){
 const ctx=new Context(),writes=[],dir=absolute('.test-artifacts'),entry={options:{id:'qq-history-search',name:'dsh-qq-history-search',config:{}},disabled:false,fiber:{effectiveConfig:Config(enabled?{enabled:true,tenants:['tenant-a'],accounts:['account-a'],groups:['group-a']}:{enabled:false}),state:2}}
 const editor={entries:()=>[entry],async edit(target,change){assert.equal(target,entry);const next=change(entry.options.config);if(editFailure)throw Error('synthetic failure');writes.push(next);entry.options.config=next;entry.fiber.effectiveConfig=Config(next)}}
 const fixture=ctx.plugin({name:'history-control-fixture',apply(child){child.effect(()=>child.provide('profileContext',{dir}));child.effect(()=>child.provide('configEditor',editor));if(service)child.effect(()=>child.provide('qqHistorySearch',service));if(requests)child.effect(()=>child.provide('imRequests',requests))}});await fixture.await()
 const fiber=ctx.plugin(Control,ControlConfig({}));await fiber.await();t.after(async()=>{await fiber.dispose();await fixture.dispose()})
 return{control:ctx.qqHistoryControl,entry,writes}
}
test('owner saves exact scope and operator bindings with optimistic revision',async t=>{
 const {control,writes}=await mount(t),initial=await control.describe();assert.equal(snapshotSchema.safeParse(initial).success,true)
 const operator={tenant:'tenant-a',network:'onebot11',account:'account-a',user:'admin'}
 const saved=await control.save({revision:initial.revision,patch:{tenants:['tenant-a'],accounts:['account-a'],groups:['group-a'],operators:[operator]}})
 assert.deepEqual(saved.config.operators,[operator]);assert.equal(writes.length,1)
 await assert.rejects(control.save({revision:initial.revision,patch:{enabled:true}}),error=>error.details?.reason==='conflict')
 await assert.rejects(async()=>control.save({revision:saved.revision,patch:{operators:[{...operator,extra:'bad'}]}}),error=>error.details?.reason==='invalid')
 assert.equal(saveSchema.safeParse({revision:saved.revision,patch:{secret:'x'}}).success,false)
 const enabled=await control.save({revision:saved.revision,patch:{enabled:true}});assert.equal(enabled.config.enabled,true)
})
test('busy searches refuse config changes without acquiring maintenance',async t=>{
 let ended=0;const service={status:()=>({active:1,stopping:false,maintenance:false}),beginMaintenance:()=>false,endMaintenance:()=>{ended++}}
 const {control,writes}=await mount(t,{service,enabled:true}),initial=await control.describe();assert.equal(initial.running,1)
 await assert.rejects(control.save({revision:initial.revision,patch:{maxScan:12}}),error=>error.details?.reason==='busy');assert.equal(writes.length,0);assert.equal(ended,0)
})
test('failed editor releases the admission gate',async t=>{
 let held=false,ended=0;const service={status:()=>({active:0,stopping:false,maintenance:held}),beginMaintenance:()=>{held=true;return true},endMaintenance:()=>{held=false;ended++}}
 const {control,writes}=await mount(t,{service,editFailure:true,enabled:true}),initial=await control.describe()
 await assert.rejects(control.save({revision:initial.revision,patch:{maxScan:12}}),error=>error.details?.reason==='apply-failed');assert.equal(held,false);assert.equal(ended,1);assert.equal(writes.length,0)
})
test('an enabled entry without an attached service rejects unsafe edits',async t=>{
 const {control}=await mount(t,{enabled:true}),initial=await control.describe()
 await assert.rejects(control.save({revision:initial.revision,patch:{maxScan:12}}),error=>error.details?.reason==='busy')
})
test('model tools require a live request provider and sender-isolated group Sessions',async t=>{
 const service={status:()=>({active:0,stopping:false,maintenance:false}),beginMaintenance:()=>true,endMaintenance(){}}
 const missing=await mount(t,{service,enabled:true}),a=await missing.control.describe()
 await assert.rejects(missing.control.save({revision:a.revision,patch:{toolsEnabled:true}}),error=>error.details?.reason==='request-provider-missing');assert.equal(missing.writes.length,0)
 const shared=new RequestAuthority('shared'),blocked=await mount(t,{service,enabled:true,requests:shared.service}),b=await blocked.control.describe();t.after(()=>shared.close())
 await assert.rejects(blocked.control.save({revision:b.revision,patch:{toolsEnabled:true}}),error=>error.details?.reason==='sender-isolation-required');assert.equal(blocked.writes.length,0)
 blocked.entry.fiber.effectiveConfig=Config({...b.config,toolsEnabled:true});assert.equal((await blocked.control.describe()).toolState,'sender-isolation-required')
 const isolated=new RequestAuthority('sender'),allowed=await mount(t,{service,enabled:true,requests:isolated.service}),c=await allowed.control.describe();t.after(()=>isolated.close())
 assert.equal((await allowed.control.save({revision:c.revision,patch:{toolsEnabled:true}})).config.toolsEnabled,true);assert.equal(allowed.writes.length,1)
})
