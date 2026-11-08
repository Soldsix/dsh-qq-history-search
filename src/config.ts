/** Archive selection, authorization and resource ceilings. */
import z from '@deepseek-ai/schemastery'
import {isAbsolute,join} from 'node:path'
import {identifier,type TenantId,type NetworkId,type AccountId,type PeerId} from 'dsh-im-kit'
import type {Settings} from './fields.ts'
/** Host-provided allowlists and bounded query settings. */
export interface Config extends Settings{}
/** All archive scopes are excluded until explicitly configured. */
export const Config:z<Config>=z.object({enabled:z.boolean().default(false),directory:z.string().default(''),tenants:z.array(z.string()).default([]),networks:z.array(z.string()).default(['onebot11']),accounts:z.array(z.string()).default([]),groups:z.array(z.string()).default([]),privatePeers:z.array(z.string()).default([]),operators:z.array(z.object({tenant:z.string(),network:z.string(),account:z.string(),user:z.string()})).default([]),maxConcurrent:z.number().min(1).max(64).step(1).default(4),maxScan:z.number().min(1).max(10000).step(1).default(512),maxScanBytes:z.number().min(1024).max(268435456).step(1).default(16777216),maxResults:z.number().min(1).max(100).step(1).default(20),maxRecordBytes:z.number().min(1024).max(67108864).step(1).default(4194304),maxResultBytes:z.number().min(1024).max(16777216).step(1).default(524288),timeoutMs:z.number().min(100).max(120000).step(1).default(10000)})
/** Validated exact selections. Lists form an intersection, not tuple pairs. */
export interface Spec extends Omit<Config,'tenants'|'networks'|'accounts'|'groups'|'privatePeers'|'operators'>{readonly tenants:ReadonlySet<TenantId>;readonly networks:ReadonlySet<NetworkId>;readonly accounts:ReadonlySet<AccountId>;readonly groups:ReadonlySet<PeerId>;readonly privatePeers:ReadonlySet<PeerId>;readonly operators:ReadonlySet<string>}
/** @param config - parsed settings. @param profile - absolute profile path. @returns resolved settings or disabled state. */
export function resolve(config:Config,profile:string):Spec|null{
 if(!config.enabled)return null
 if(!isAbsolute(profile)||(config.directory&&!isAbsolute(config.directory)))throw new Error('History paths must be absolute')
 const tenants=new Set(config.tenants.map(x=>identifier('im.tenant',x))),networks=new Set(config.networks.map(x=>identifier('im.network',x))),accounts=new Set(config.accounts.map(x=>identifier('im.account',x))),groups=new Set(config.groups.map(x=>identifier('im.peer',x))),privatePeers=new Set(config.privatePeers.map(x=>identifier('im.peer',x)))
 const operators=new Set(config.operators.map(x=>JSON.stringify([identifier('im.tenant',x.tenant),identifier('im.network',x.network),identifier('im.account',x.account),identifier('im.user',x.user)])))
 if(tenants.size!==config.tenants.length||networks.size!==config.networks.length||accounts.size!==config.accounts.length||groups.size!==config.groups.length||privatePeers.size!==config.privatePeers.length||operators.size!==config.operators.length)throw new Error('Duplicate history selection')
 if(!tenants.size||!networks.size||!accounts.size||(!groups.size&&!privatePeers.size))throw new Error('Explicit history tenant, network, account and scope selections are required')
 return{...config,directory:config.directory||join(profile,'data','qq-archive'),tenants,networks,accounts,groups,privatePeers,operators}
}
