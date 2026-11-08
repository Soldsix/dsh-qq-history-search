import test from 'node:test'
import assert from 'node:assert/strict'
import {readdir,readFile} from 'node:fs/promises'
test('history consumer contains no SQL, database paths or storage-file access',async()=>{
 const root=new URL('../src/',import.meta.url),files=await readdir(root)
 for(const file of files.filter(name=>name.endsWith('.ts'))){const text=await readFile(new URL(file,root),'utf8');assert.equal(/DatabaseSync|archive_scope|\.sqlite3|node:sqlite|node:fs/.test(text),false,'Storage ownership regression in '+file)}
})
