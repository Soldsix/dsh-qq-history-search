import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
test('history depends on the published storage-owner API and ships no application binary',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
 assert.equal(manifest.bin,undefined)
 assert.equal(manifest.dependencies['dsh-qq-archive'],'https://github.com/Soldsix/dsh-qq-archive/releases/download/v0.2.1/dsh-qq-archive-0.2.1.tgz')
 assert.equal(manifest.dependencies['dsh-im-kit'],'https://github.com/Soldsix/dsh-im-kit/releases/download/v0.2.1/dsh-im-kit-0.2.1.tgz')
 for(const value of Object.values({...manifest.dependencies,...manifest.peerDependencies}))assert.equal(/^(file:|link:|workspace:)/.test(value),false)
})
