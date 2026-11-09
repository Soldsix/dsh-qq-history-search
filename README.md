---
description: "Search authorized conversation archives through a Host service or an opt-in native model tool."
kind: "package-bundle"
---
# dsh-qq-history-search

English | [中文](README.zh.md)

## Summary

Search exact text in selected archives with requester authorization, bounded work and encrypted pagination. The archive plugin owns storage. An optional native tool binds the requester to the current authenticated chat turn; it rejects model-selected identities and shared group model Sessions. Both search and its tool are disabled initially. This is exact-text retrieval, not semantic or automatic long-term memory.

## Table of Contents

- [Install](#install)
- [Authorization](#authorization)
- [Native model tool](#native-model-tool)
- [Query behavior](#query-behavior)
- [Verification and limits](#verification-and-limits)

<a id="install"></a>
## Install

Use DSH 0.2.2-rc.1 and Cordis ~4.1.0. Native profiles require Node >=24.9; library tests also cover Node 22.19. Install the archive bundle, then this bundle; public library dependencies are fetched automatically. Enable the archive separately with explicit scopes and `readEnabled: true`. Search waits for `qqArchive` and stops when its provider is removed. No application binary or separate server is installed.

```sh
dsh plugin --profile MY_PROFILE add https://github.com/Soldsix/dsh-qq-archive/releases/download/v0.2.1/dsh-qq-archive-0.2.1.tgz
dsh plugin --profile MY_PROFILE add https://github.com/Soldsix/dsh-qq-history-search/releases/download/v0.3.0-development/dsh-qq-history-search-0.3.0-development.tgz
```

The native owner page exposes every scope, operator, resource and tool setting. Revision checks retain invalid drafts; updates require idle queries. Status reports query counts and tool readiness without message bodies. Settings persist in the DSH profile.

<a id="authorization"></a>
## Authorization

Host callers bind `requester` and `scope` to an authenticated event. Ordinary requesters retrieve only their own text in a selected conversation. Operators are explicitly bound to tenant, network, bot account and user; they may select another sender or all senders inside that conversation. Scope lists intersect rather than forming account/group pairs. The archive enforces its own selections again.

A Host caller controls the output audience. Model-tool results can be included in public group replies; this is not a private delivery feature. Same-process Host plugins and local administrators are trusted. This plugin cannot sandbox malicious Host code. Storage encryption and retention belong to the archive owner.

<a id="native-model-tool"></a>
## Native model tool

Install dsh-qq-chat 0.3.0-development or a compatible `imRequests` provider. Enable `isolateGroupSenders` in Chat, add `qq_history_search` to its `allowedTools`, then enable `toolsEnabled` in History. The settings page refuses missing attribution or shared group Sessions. A manually configured shared-group profile retains Host search but reports `sender-isolation-required` and registers no model tool.

The tool accepts `query`, optional `limit`, `sender`, `allSenders` and `before`. Scope, requester and execution identity are never model arguments. The exact live `exec.agent` object must resolve to an admitted source; copied objects, agent IDs, saved Session metadata and local previews grant no authority. Cancellation, unload or a replaced source revokes pending reads. Results arriving after revocation are refused.

Canonical results contain `status`, `reason`, `matches`, `partial` and `next`. Each match includes its sender, message ID, timestamps, text, non-text flag and truncation flag. Excerpts share the `toolTextChars` total budget and obey `toolMatchChars`; `toolMaxResults` cannot exceed the Host result cap. Unicode-safe truncation never edits the original archive. Session tool-result events log model-visible output. Native clients use generic search cards; Web uses the generic tool presentation. Archived text is untrusted data, not new instructions.

Private tool results must not persist in a shared group model Session. Sender-isolated Sessions prevent the next participant from inheriting these results. Enabling isolation preserves previous shared logs and starts separate histories. This candidate does not inject public shared-topic context or automatically erase previously shared results. Do not downgrade to shared Sessions after enabling private retrieval without separately reviewing retained model context.

<a id="query-behavior"></a>
## Query behavior

`qqHistorySearch.search(request, signal)` matches exact, case-sensitive Unicode substrings across text segments. It does not recognize aliases or inspect image content. The Host returns complete matching text without attachment references or bytes; model tools return bounded excerpts. A bounded empty page does not establish absence from the full archive. `partial` reports skipped records or truncated excerpts; `next` indicates another page.

Limits cover scanned records/bytes, returned records/bytes, individual record size, concurrency and deadlines. The archive owner may impose stricter ceilings. Encrypted cursors bind scope, requester, sender filter and query; restart expires them. Disposal cancels and joins owned queries without closing the archive or interrupting other consumers. No database path is accepted here.

<a id="verification-and-limits"></a>
## Verification and limits

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm pack --pack-destination artifacts
npm run test:consumer
npm run test:native
npm run test:model
npm run test:browser
npm run test:web
```

Fixtures use synthetic identities and isolated profiles. The model test uses the real DSH adapter and tool executor against a controlled loopback HTTP response; it does not measure semantic recall or use a real model API. Never point these tests at production records. No real QQ client verification is claimed.

## Model Experience

The configured model may select the optional tool. Its definition is visible in permitted tool sets after registration, but execution requires an authorized live turn; manual or unbound invocations are refused. Results are exact-text matches with visible refusal and partial-result categories. Automatic memory selection, semantic ranking and natural shared-topic recall are not implemented.

## Known Limitations and Deferred Work

No cross-conversation model search, semantic embeddings, date-range query, attachment perception, automatic fact correction, long-term memory consolidation or output-recipient enforcement is provided. Generic tool cards do not provide an archive browser. Privacy tests use controlled fixtures and do not prove resistance to every model disclosure.

## Dev Note

The archive public service owns SQLite. This package owns authorization and model excerpts. `dsh-im-requests` supplies only live attribution; messaging consumers own source admission and model-history isolation. New source or result data must remain reconstructable from native Session events.
