# dsh-qq-history-search

An opt-in, bounded, read-only search service for archives written by `dsh-qq-archive` format 1. The plugin is under development and is not ready for production or public release. It does not register a model-facing tool, a QQ handler, a Web settings page, or an automatic memory system.

The caller is trusted Host code: it must bind `requester` and `scope` to an authenticated incoming event and must never let the model choose either identity. Ordinary requesters may search only their own archived text within a configured conversation. Explicit operators can search another sender or all senders; each operator is bound to an exact tenant, network, bot account and user ID. Same-process plugins and local administrators are trusted: this library does not defend against a malicious Host or filesystem administrator.

The configuration lists form an intersection, not explicit account/group pairs. No scope is enabled by default. Search uses exact, case-sensitive Unicode substring matching across text segments. It does not recognize aliases, search images, or prove that a missing result is absent from the whole history. Each page has limits on records scanned, bytes inspected, matches, result bytes, concurrency and time. `partial: true` means some oversized records or results were omitted; `next` means more records remain in the current bounded scan. Cursors are encrypted, tied to scope, requester, sender filter and query, and expire when the service restarts.

SQLite is opened with `readOnly` and `query_only`; platform SQLite may still need WAL shared-memory sidecars. Results exclude attachment references and bytes. File permissions and retention are managed by the operator; archives are not encrypted. No existing data is deleted, migrated or changed by this plugin. Requires Node ^22.19 or >=24, DSH 0.2.2-rc.1, `dsh-im-kit` 0.2.0 and an archive produced by the compatible archive plugin.

Run `npm test` with synthetic fixtures. A downstream adapter, UI, actual QQ use, Linux compatibility and release have not yet been validated. The `dsh-im-kit` package currently requires a locally built archive until published.
