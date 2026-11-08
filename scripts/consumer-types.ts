/** Strict external consumer type fixture with no database access. */
import {HistoryError,type Failure,type HistoryService,type SearchRequest,type SearchPage} from 'dsh-qq-history-search'
const search=(service:HistoryService,input:SearchRequest,signal:AbortSignal):Promise<SearchPage>=>service.search(input,signal)
const code=(error:HistoryError):Failure=>error.code
export {search,code}
