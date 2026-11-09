/** Strict external consumer type fixture with no database access. */
import {HistoryError,HISTORY_TOOL,HistoryModelTool,type HistoryToolValue,type Failure,type HistoryService,type SearchRequest,type SearchPage} from 'dsh-qq-history-search'
import type {ToolDefinition} from '@deepseek-ai/dsh-tools'
import type {RequestService} from 'dsh-im-requests'
const search=(service:HistoryService,input:SearchRequest,signal:AbortSignal):Promise<SearchPage>=>service.search(input,signal)
const code=(error:HistoryError):Failure=>error.code
const definition=(tool:HistoryModelTool):ToolDefinition=>tool.definition()
const result=(value:HistoryToolValue):'ok'|'refused'=>value.status
const requester=(service:RequestService,owner:object)=>service.current(owner)
const toolName:'qq_history_search'=HISTORY_TOOL
export {search,code,definition,result,requester,toolName}
