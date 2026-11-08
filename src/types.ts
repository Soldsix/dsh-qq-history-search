/** Host-only search inputs and bounded result metadata. */
import type {ConversationScope,MessageId,UserId} from 'dsh-im-kit'
/** Host must bind requester and scope to the authenticated event, never model-supplied strings. */
export interface SearchRequest{readonly scope:ConversationScope;readonly requester:UserId;readonly query:string;readonly limit:number;readonly sender?:UserId;readonly allSenders?:boolean;readonly before?:string}
/** One complete archived text record. Media bytes and attachment references are excluded. */
export interface HistoryMatch{readonly messageId:MessageId;readonly sender:UserId;readonly receivedAt:number;readonly sentAt:number;readonly text:string;readonly hasNonText:boolean}
/** A bounded page; partial reports that an oversized record could not be inspected. */
export interface SearchPage{readonly matches:readonly HistoryMatch[];readonly partial:boolean;readonly next:string|null}
/** A search service for trusted Host code only; it is not a model tool. */
export interface HistoryService{
 /** @param request - scope and authenticated requester bound by trusted Host code. @param signal - caller cancellation. @returns bounded search page. */
 search(request:SearchRequest,signal:AbortSignal):Promise<SearchPage>
 /** @returns outstanding worker count with no message content. */
 status():{readonly active:number;readonly stopping:boolean}
}
