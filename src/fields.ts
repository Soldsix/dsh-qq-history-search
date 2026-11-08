/** An administrator identity is bound to an exact transport account. */
export interface Operator{tenant:string;network:string;account:string;user:string}
/** Browser-safe profile settings. */
export interface Settings{enabled:boolean;tenants:string[];networks:string[];accounts:string[];groups:string[];privatePeers:string[];operators:Operator[];maxConcurrent:number;maxScan:number;maxScanBytes:number;maxResults:number;maxRecordBytes:number;maxResultBytes:number;timeoutMs:number}
/** Editable representations used by the owner form. */
export const FIELDS={enabled:'boolean',tenants:'list',networks:'list',accounts:'list',groups:'list',privatePeers:'list',operators:'operators',maxConcurrent:'number',maxScan:'number',maxScanBytes:'number',maxResults:'number',maxRecordBytes:'number',maxResultBytes:'number',timeoutMs:'number'} as const satisfies Record<keyof Settings,string>
