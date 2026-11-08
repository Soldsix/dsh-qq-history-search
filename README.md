# dsh-qq-history-search

Opt-in, bounded history search through the public `dsh-qq-archive` Host service. The archive owns all SQLite access. This plugin owns requester authorization, query limits and encrypted pagination; it accepts no database path and registers no model tool, QQ command or automatic memory system.

## Install

```sh
dsh plugin --profile MY_PROFILE add https://github.com/Soldsix/dsh-qq-archive/releases/download/v0.2.1/dsh-qq-archive-0.2.1.tgz
dsh plugin --profile MY_PROFILE add https://github.com/Soldsix/dsh-qq-history-search/releases/download/v0.2.1/dsh-qq-history-search-0.2.1.tgz
```

The library dependencies are fetched automatically; enable the archive bundle separately, select its scopes and set `readEnabled: true`. History search waits for its `qqArchive` service and stops when that service is removed. Both bundles are disabled initially. Target: DSH 0.2.2-rc.1, Cordis ~4.1.0, Node ^22.19 or >=24.

## Authorization

Trusted Host code must bind `requester` and `scope` to an authenticated incoming event; the model must never choose them. Ordinary requesters can retrieve only their own text in a configured conversation. Explicit operators can request another sender or all senders. Each operator is bound to the exact tenant, network, bot account and user ID. The caller must separately enforce whether the result may be disclosed to the intended output audience.

Scope lists intersect rather than forming account/group pairs; no scope is selected by default. The archive service enforces its own scope selections again. Same-process plugins and local administrators are trusted; this API cannot sandbox malicious Host code. This preview does not expose queries directly to an LLM.

```yaml
- id: qq-archive
  config:
    enabled: true
    readEnabled: true
    tenants: [example-tenant]
    accounts: [example-account]
    groups: [example-group]
- id: qq-history-search
  config:
    enabled: true
    tenants: [example-tenant]
    networks: [onebot11]
    accounts: [example-account]
    groups: [example-group]
    operators:
      - tenant: example-tenant
        network: onebot11
        account: example-account
        user: example-admin
```

Replace all example IDs with the authenticated provider's identities. Omit `operators` when cross-sender reads are not intended. Storage location is configured only on the archive plugin. The unpublished prototype's history `directory` setting has been removed; no stored records or database version are changed.

## Query behavior

`qqHistorySearch.search(request, signal)` matches exact, case-sensitive Unicode substrings across text segments. It does not recognize aliases or search image content. A bounded empty page does not establish absence from the full history. Complete text is returned without attachment references or bytes. `partial: true` reports oversized records/results skipped; `next` indicates another page is available.

Limits cover scanned records/bytes, returned records/bytes, record bytes, concurrent queries and time. The archive owner's stricter ceilings also apply. Encrypted cursors bind scope, requester, sender filter and query; they expire on service restart. A caller cancellation or deadline ends only that query. Disposal waits for its queries without closing the archive or interrupting ingestion and other consumers.

The native owner settings page configures scopes, operator bindings and limits with revision checks. Changes require idle queries and pause admission during the update; restart expires existing cursors. Operational counters contain no message text. Archive file security, encryption and retention remain the storage owner's responsibility.

## Development and preview scope

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm pack --pack-destination artifacts
npm run test:native
npm run test:browser
npm run test:web
```

All fixtures use synthetic identities and fresh profiles. Never point tests at production records. This preview is a Host query service; authenticated QQ/model adapters, public-output privacy, semantic memory, natural conversation recall and real QQ/desktop verification remain separate work.
