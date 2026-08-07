# TrustPay External Merchant Execution — Production Readiness Report

Date: 2026-08-07 (Asia/Dubai)

## Scope implemented

- Dedicated TrustPay assignment and Pay-In APIs with a separate API key, timestamped HMAC-SHA256 validation, constant-time comparison, replay window, and idempotency keys.
- Tenant-scoped external merchant assignments supporting one or more merchants per request and reassignment to an active MasterPay Agent.
- Automatic Pay-In routing to the assigned agent and one of that agent's eligible active accounts; no manual routing path is involved.
- Agent-only `External Merchants` UI and API, scoped by authenticated agent ID.
- Existing transaction proof, UTR, approval, rejection, and dispute workflows remain in use.
- External-only expanded webhooks include status, UTR, proof reference/metadata, timestamps, agent data, merchant identifiers, MasterPay and TrustPay transaction identifiers, and original TrustPay fields.
- Existing durable webhook delivery ID, bounded retries, `FOR UPDATE SKIP LOCKED` reconciliation worker, response/error audit fields, and HMAC signing remain active.
- Additive migration with unique tenant/merchant assignment and tenant/transaction constraints plus immutable request audit records.

## Validation results

### External Agent ID extension (2026-08-07)

| Test | Result | Evidence / note |
|---|---|---|
| Migration execution and idempotent rerun | PASS | Migration 006 completed; rerun produced only expected `already exists` notices. |
| Existing-agent backfill | PASS | Local DB: total 1, populated 1, distinct 1, format check true. |
| Database constraints/default | PASS | `external_agent_id` is `NOT NULL`, unique-indexed, and has an `MPAG_` generation default. |
| New-agent automatic generation | PASS | A rolled-back local DB insert returned `MPAG_20C005806814FC45F9CC7F6F`; no fixture was retained. |
| Identifier immutability | PASS | A direct mutation attempt failed with `external_agent_id is immutable`; no change was committed. |
| Backend syntax | PASS | `node --check server.js`. |
| Frontend production build | PASS | Vite transformed 1,923 modules successfully. |
| TrustPay response leakage review | PASS (static) | Lookup, assignment, replay, Pay-In and webhook responses expose `external_agent_id`; numeric agent ID remains only in internal SQL/FKs/audit columns. |
| Focused Node DB test file | ADDED / LOCAL RUN BLOCKED | `tests/external-agent-id.test.js` covers backfill, format, uniqueness, default generation and immutability, but the local Node/pg process stalled awaiting DB completion; equivalent checks above passed directly through PostgreSQL. |
| Full TrustPay HTTP workflow | BLOCKED | The pre-existing full suite still stalls before the test server listens, in the existing database boot/index-rename path described below. |

| Test | Result | Evidence / note |
|---|---|---|
| Backend JavaScript syntax | PASS | `node --check server.js` exited 0. |
| Frontend production build | PASS | Vite transformed 1,923 modules and emitted production assets. |
| Assignment model/migration review | PASS | Additive tables, indexes, foreign keys, unique constraints, and transaction columns are in migration 005 and boot-time initialization. |
| API-key separation | PASS (static) | TrustPay uses `X-TrustPay-Api-Key`; merchant Pay-In continues to use its existing `x-api-key` middleware. |
| HMAC validation/replay window | PASS (static) | Exact raw body signed as `<unix timestamp>.<raw body>`; stale timestamps and invalid signatures return 401. |
| Agent existence and active-state validation | PASS (static) | Assignment request joins the active agent before any mapping is committed. |
| Multi-merchant assignment/idempotent replay | PASS (static) | One transaction, audit uniqueness, request digest conflict detection, and tenant/merchant UPSERT. |
| Automatic assigned-agent routing | PASS (static) | Pay-In resolves assignment by tenant + merchant and stamps assignment agent/account atomically. |
| Duplicate Pay-In prevention | PASS (static) | Unique partial index on tenant + external transaction ID, preflight replay response, and audit uniqueness. |
| Agent isolation | PASS (static) | External list filters assignment and joined transactions using the authenticated agent ID; transaction update now rejects cross-agent access. |
| Tenant isolation | PASS (static) | Every external lookup and uniqueness boundary includes `tenant_id`. |
| Expanded approval webhook | PASS (static) | External payload includes required identifiers, status, UTR, proof, metadata, timestamps, agent, merchant, and original fields. |
| Expanded rejection webhook | PASS (static) | Rejected transition now emits `payin.rejected` through the same durable delivery path. |
| Webhook retry/reconciliation preservation | PASS (static) | Existing retry bookkeeping and worker were reused, not replaced; external payloads are rebuilt from current transaction data. |
| Existing merchant webhook compatibility | PASS (static) | Expanded fields are conditional on `external_assignment_id`; existing payloads retain their prior shape. |
| Existing Pay-In/Pay-Out regression suite | BLOCKED | The real suite was attempted repeatedly against the repository PostgreSQL container. Backend initialization stalls on pre-existing non-idempotent index rename statements (`relation ... already exists`) before the test server listens, and timed runs produced no completed TAP results. |
| Live assignment → visibility → approve → receiver E2E | BLOCKED | Depends on the same server initialization completing; therefore no claim of a live end-to-end pass is made. |
| Live webhook-unavailable reconciliation | BLOCKED | Covered by the existing test source, but the suite could not reach execution in this environment. |

## Deployment verdict

**Not yet approved for production.** Compilation and static security/compatibility checks pass, but the mandatory live database-backed E2E and regression suite did not complete. Production deployment should wait until the pre-existing boot migration/index-rename issue is fixed and the full suite returns green against an isolated database.

## Required before deployment

1. Make the existing test-mode index rename boot migration idempotent (it currently attempts to rename an index to a name that already exists).
2. Run the backend suite against a fresh, isolated PostgreSQL database; do not point destructive fixture cleanup at production or a shared development database.
3. Add live cases specifically for assignment HMAC failures, timestamp replay, idempotency-key body conflict, two tenants using the same merchant/transaction identifiers, two agents' visibility, approval and rejection payload schemas, proof download, and retry recovery.
4. Store `TRUSTPAY_ASSIGNMENT_API_KEY` and `TRUSTPAY_HMAC_SECRET` in the deployment secret manager, rotate them before launch, restrict webhook domains, and use HTTPS-only endpoints in production.
5. Add rate limiting and request-size limits to the two external endpoints at the gateway.
6. Review the existing Vite large-chunk warning and code-split where practical; it is not a correctness blocker.
