/** Install real DSH bundles and exercise their native tool pipeline with a controlled loopback model. */
import assert from 'node:assert/strict'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {once} from 'node:events'
import {createServer} from 'node:http'
import {mkdir,mkdtemp,readFile,writeFile,realpath,copyFile} from 'node:fs/promises'
import {join,relative,isAbsolute,basename,delimiter} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {pnpmScript} from './pnpm.mjs'
import {requiredProfilePeers} from './profile-peers.mjs'
import {verifyInstalledArchive} from './verify-installed.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv,manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'))
const runs=join(root,'.test-artifacts','model-native');await mkdir(runs,{recursive:true})
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
const resumed=option('--resume'),area=resumed?await realpath(resumed):await mkdtemp(join(runs,'run-'))
const owned=relative(runs,area);assert.ok(!owned.startsWith('..')&&!isAbsolute(owned),'Resume target must stay in the model-test directory')
const attempt=await mkdtemp(join(area,'attempt-')),home=join(area,'home'),profile='history-model',profileRoot=join(home,'profiles',profile)
const archives=[]
for(const [name,input]of [['dsh-qq-archive',option('--archive')??manifest.dependencies['dsh-qq-archive']],['dsh-qq-chat',option('--chat')??'https://github.com/Soldsix/dsh-qq-chat/releases/download/v0.3.0-development/dsh-qq-chat-0.3.0-development.tgz'],[manifest.name,option('--history')??join(root,'artifacts',manifest.name+'-'+manifest.version+'.tgz')]]){
 const target=join(attempt,name+'.tgz')
 if(input.startsWith('https://')){const response=await fetch(input,{signal:AbortSignal.timeout(90000)});assert.ok(response.ok,'Public input unavailable: '+name);await writeFile(target,Buffer.from(await response.arrayBuffer()))}else await copyFile(await realpath(input),target)
 const {stdout}=await promisify(execFile)('tar',['-xOf',target,'package/package.json'],{windowsHide:true,maxBuffer:1024*1024})
 archives.push({name,path:target,manifest:JSON.parse(stdout),sha256:createHash('sha256').update(await readFile(target)).digest('hex')})
}
await writeFile(join(attempt,'inputs.json'),JSON.stringify(archives.map(({name,sha256})=>({name,sha256})),null,2)+'\n')
const captures=[],failures=[];let active=0,peak=0
const parallelSeen=new Set();let releaseParallel
const parallelReady=new Promise(done=>{releaseParallel=done})
const command=data=>{const content=data.messages?.filter(item=>item.role==='user').at(-1)?.content;if(Array.isArray(content)&&content.some(block=>block.type==='tool_result'))return null;const text=typeof content==='string'?content:content?.filter(block=>block.type==='text').map(block=>block.text).join('\n');return text?.match(/HISTORY_NATIVE_[A-Z_]+/g)?.at(-1)}
const server=createServer(async(req,res)=>{
 if(req.url?.endsWith('/models')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({object:'list',data:[{id:'deepseek-flash',object:'model',owned_by:'fixture',input_modalities:['text'],output_modalities:['text'],api_capabilities:{anthropic_messages:{}}}]}));return}
 if(!req.url?.endsWith('/messages')){res.statusCode=404;res.end();return}
 let raw='';for await(const chunk of req)raw+=chunk;const data=JSON.parse(raw),marker=command(data);captures.push({data,marker});active++;peak=Math.max(peak,active)
 const gone=new AbortController();res.once('close',()=>gone.abort())
 try{
  if(marker==='HISTORY_NATIVE_PARALLEL_A'||marker==='HISTORY_NATIVE_PARALLEL_OTHER'){
   parallelSeen.add(marker);if(parallelSeen.size===2)releaseParallel()
   const timer=new AbortController()
   try{await Promise.race([parallelReady,delay(10000,undefined,{signal:AbortSignal.any([gone.signal,timer.signal]),ref:false}).then(()=>{throw Error('Parallel conversations did not reach the model together')})])}finally{timer.abort()}
  }
  await delay(30,undefined,{signal:gone.signal});res.writeHead(200,{'Content-Type':'text/event-stream'})
  const send=(type,payload)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...payload})+'\n\n')
  send('message_start',{message:{id:'history-'+captures.length,type:'message',role:'assistant',model:data.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}})
  const noTool=marker==='HISTORY_NATIVE_PREVIEW'||marker==='HISTORY_NATIVE_SHARED'
  if(marker&&!noTool){
   let input={query:'ALLOW'}
   if(marker==='HISTORY_NATIVE_OTHER_SENDER')input.sender='bob'
   if(marker==='HISTORY_NATIVE_ALL_SENDERS'||marker==='HISTORY_NATIVE_ADMIN'||marker==='HISTORY_NATIVE_PARALLEL_OTHER')input.allSenders=true
   if(marker==='HISTORY_NATIVE_FORGED_REQUESTER')input.requester='admin'
   assert.ok(data.tools?.some(tool=>tool.name==='qq_history_search'),'Native history tool is not advertised for '+marker)
   send('content_block_start',{index:0,content_block:{type:'tool_use',id:'history-call-'+captures.length,name:'qq_history_search',input:{}}})
   send('content_block_delta',{index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(input)}});send('content_block_stop',{index:0})
   send('message_delta',{delta:{stop_reason:'tool_use',stop_sequence:null},usage:{output_tokens:10}})
  }else{
   if(noTool)assert.ok(!data.tools?.some(tool=>tool.name==='qq_history_search'),'History tool leaked to preview or shared Session')
   send('content_block_start',{index:0,content_block:{type:'text',text:''}});send('content_block_delta',{index:0,delta:{type:'text_delta',text:'HISTORY_OK'}});send('content_block_stop',{index:0});send('message_delta',{delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:10}})
  }
  send('message_stop',{});res.end()
 }catch(error){if(!gone.signal.aborted){failures.push(error.message);res.destroy(error)}}finally{active--}
})
server.listen(0,'127.0.0.1');await once(server,'listening');server.unref()
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/KEY|SECRET|TOKEN|PASSWORD|DEEPSEEK_BASE_URL/i.test(key)&&key.toUpperCase()!=='PATH'))
await mkdir(join(attempt,'temp'),{recursive:true});Object.assign(env,{PATH:join(root,'node_modules','.bin')+delimiter+(process.env.PATH??process.env.Path??''),DSH_HOME:home,TEMP:join(attempt,'temp'),TMP:join(attempt,'temp'),DSH_PRIMARY_RUNTIME:'',DSH_SYSTEM_PROMPT:'Synthetic history integration. No user persona or skills.',DEEPSEEK_API_KEY:'synthetic-loopback-only',DEEPSEEK_BASE_URL:'http://127.0.0.1:'+server.address().port+'/anthropic'})
const setup=[]
async function run(argv,cwd){const timeout=AbortSignal.timeout(300000),child=spawn(process.execPath,argv,{cwd,env,windowsHide:true,signal:timeout,stdio:['ignore','pipe','pipe']});let output='',failure;child.stdout.on('data',data=>{output+=data});child.stderr.on('data',data=>{output+=data});child.once('error',error=>{failure=error});const [code,signal]=await new Promise(done=>child.once('close',(...values)=>done(values)));setup.push({argv,code,signal,output});await writeFile(join(attempt,'setup.json'),JSON.stringify(setup,null,2)+'\n');if(failure)throw failure;assert.equal(signal,null);assert.equal(code,0,output.slice(-2000));return output}
let child,exit,exitCode,stdout='',stderr=''
try{
 const bootstrap=join(root,'node_modules','@deepseek-ai','dsh','lib','bin.js')
 if(!resumed)await run([bootstrap,'--profile',profile,'--from-default-profile','sdk','--dump-config'],area)
 const pm=JSON.parse(await readFile(join(profileRoot,'package.json'),'utf8'));pm.pnpm={...pm.pnpm,overrides:manifest.overrides};await writeFile(join(profileRoot,'package.json'),JSON.stringify(pm,null,2)+'\n')
 await writeFile(join(profileRoot,'.npmrc'),'package-import-method=copy\nstore-dir='+join(runs,'pnpm-store').replaceAll('\\','/')+'\n')
 const pnpm=await pnpmScript(root),boot=JSON.parse(await readFile(join(root,'node_modules','@deepseek-ai','dsh-app-boot','package.json'),'utf8'))
 const peers=new Map(Object.entries(boot.peerDependencies));for(const item of archives)for(const pair of Object.entries(item.manifest.peerDependencies))peers.set(...pair)
 await run([pnpm,'add','@deepseek-ai/dsh@0.2.2-rc.1','@deepseek-ai/dsh-llm-deepseek-api-key@0.2.2-rc.1',...[...peers].map(([name,version])=>name+'@'+version),'--ignore-scripts'],profileRoot)
 for(const item of archives)await run([bootstrap,'plugin','--profile',profile,'add',item.path],area)
 for(;;){const missing=await requiredProfilePeers(profileRoot);if(!missing.length)break;await run([pnpm,'add',...missing,'--ignore-scripts'],profileRoot)}
 const installed={};for(const item of archives)installed[item.name]=await verifyInstalledArchive(item.path,join(profileRoot,'node_modules',item.name),join(attempt,item.name+'-installed.json'))
 const fixture=join(profileRoot,'model-fixture.mjs');await copyFile(join(root,'scripts','model-fixture.mjs'),fixture)
 const selection={enabled:true,tenants:['fixture'],networks:['onebot11'],accounts:['bot'],groups:['room','room-two']},resultPath=join(attempt,'result.json')
 const overlay=[{id:'qq-archive',config:{...selection,readEnabled:true,directory:join(attempt,'archive')}},{id:'qq-history-search',config:{...selection,toolsEnabled:true,operators:[{tenant:'fixture',network:'onebot11',account:'bot',user:'admin'}]}},{id:'qq-chat-runtime',config:{enabled:true,namespace:'model-'+basename(attempt).toLowerCase(),databasePath:join(attempt,'chat.sqlite3'),workspacePath:join(attempt,'workspace'),presetId:'history-test',provider:'deepseek-official',model:'deepseek-flash',reasoningEffort:'off',maxTokens:256,isolateGroupSenders:true,allowedTools:['qq_history_search']}},{insert:[{id:'model-preset-registry',name:'@deepseek-ai/dsh-agent-preset-registry',config:{default:'history-test'}},{id:'model-preset',name:'@deepseek-ai/dsh-agent-preset',config:{id:'history-test',plugins:[]}},{id:'model-fixture',name:pathToFileURL(fixture).href,config:{resultPath}}]}]
 await writeFile(join(profileRoot,'cordis.patch.yml'),JSON.stringify(overlay,null,2)+'\n')
 child=spawn(process.execPath,[join(profileRoot,'node_modules','@deepseek-ai','dsh','lib','bin.js'),'--profile',profile],{cwd:area,env,windowsHide:true,stdio:['pipe','pipe','pipe']})
 child.stdout.on('data',value=>{stdout+=value});child.stderr.on('data',value=>{stderr+=value});exit=once(child,'close').then(([code,signal])=>{exitCode=code;return{code,signal}})
 let result;const deadline=Date.now()+60000
 while(Date.now()<deadline){try{result=JSON.parse(await readFile(resultPath,'utf8'));break}catch(error){if(error.code!=='ENOENT')throw error}assert.equal(exitCode,undefined,'DSH exited before model probe');await delay(30)}
 assert.ok(result,'Native model probe timed out');assert.equal(result.passed,true,JSON.stringify(result));assert.deepEqual(failures,[])
 const continuations=captures.filter(item=>item.marker===null),body=item=>JSON.stringify(item.data.messages)
 assert.equal(continuations.length,10)
 const priorMarker=data=>{for(const message of [...data.messages??[]].reverse()){if(message.role!=='user')continue;const text=typeof message.content==='string'?message.content:message.content?.filter(block=>block.type==='text').map(block=>block.text).join('\n');const marker=text?.match(/HISTORY_NATIVE_[A-Z_]+/g)?.at(-1);if(marker)return marker}}
 const forMarker=marker=>{const item=continuations.find(item=>priorMarker(item.data)===marker);assert.ok(item,'No native tool result for '+marker);return item}
 for(const marker of ['HISTORY_NATIVE_OWN_A','HISTORY_NATIVE_A_AGAIN','HISTORY_NATIVE_PARALLEL_A']){const text=body(forMarker(marker));assert.ok(text.includes('ALLOW_A_CANARY'));assert.ok(!text.includes('ALLOW_B_CANARY')&&!text.includes('ALLOW_OTHER_ROOM_CANARY'))}
 for(const marker of ['HISTORY_NATIVE_OWN_B','HISTORY_NATIVE_RESTORED']){const text=body(forMarker(marker));assert.ok(text.includes('ALLOW_B_CANARY'));assert.ok(!text.includes('ALLOW_A_CANARY'))}
 for(const marker of ['HISTORY_NATIVE_OTHER_SENDER','HISTORY_NATIVE_ALL_SENDERS'])assert.ok(body(forMarker(marker)).includes('forbidden'))
 assert.ok(body(forMarker('HISTORY_NATIVE_FORGED_REQUESTER')).includes('invalid-arguments'))
 const admin=body(forMarker('HISTORY_NATIVE_ADMIN'));assert.ok(admin.includes('ALLOW_A_CANARY')&&admin.includes('ALLOW_B_CANARY'));assert.ok(!admin.includes('ALLOW_OTHER_ROOM_CANARY'))
 const other=continuations.find(item=>body(item).includes('HISTORY_NATIVE_PARALLEL_OTHER'));assert.ok(other&&body(other).includes('ALLOW_OTHER_ROOM_CANARY')&&!body(other).includes('ALLOW_B_CANARY'));assert.ok(peak>=2)
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'shutdown',params:{}})+'\n');assert.deepEqual(await Promise.race([exit,delay(15000,undefined,{ref:false}).then(()=>{throw Error('Native shutdown timed out')})]),{code:0,signal:null})
 const summary={...result,installed,normalShutdown:true,nativeAdapterRequests:captures.length,peakConcurrentRequests:peak,modelBackend:'synthetic loopback Messages through native DSH adapter',realModelApiRequests:0,realQqMessagesSent:0}
 await writeFile(join(attempt,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({area,attempt,...summary}))
}finally{
 if(child&&exitCode===undefined){child.stdin.end();const timer=setTimeout(()=>child.kill(),5000);await exit;clearTimeout(timer)}
 server.closeAllConnections();await new Promise(done=>server.close(done));await writeFile(join(attempt,'process.log'),stdout+'\n'+stderr)
 await writeFile(join(attempt,'model-requests.json'),JSON.stringify({captures,failures},null,2)+'\n')
}
