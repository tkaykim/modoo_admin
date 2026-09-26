# Private cost evidence reconciliation

`/finance/reconciliation` is a dynamic, super-admin-only view.
It uses the authenticated Supabase client, not a service-role client.
Both the route and the finance layout enforce the role, and every backing table has super-admin-only SELECT RLS.
Client INSERT/UPDATE/DELETE and anonymous SELECT are revoked.

## Data boundaries

- Bank source documents and transactions preserve source hashes, rows, dates, and original cash amounts.
- ERP source records contain only the MODOO business unit and are read-only snapshots.
- Evidence links connect source records to existing orders without changing payment or fulfillment state.
- A matched invoice line means its order association was established, not that its amount was inserted into the legacy cost ledger.
- Order-specific evidence adjustments preserve the original invoice; estimated explanations remain explicitly marked.
- Legacy cases are historical work groups, not production orders; unknown quantities remain null.
- Cash allocations cannot exceed the associated source transaction, including across split cases.
- Cash receipts, invoice values, and ERP amounts are different measurements, not additive revenue.
- Historical print and factory ledgers can contain overlapping costs and unit-versus-total differences; do not add invoice allocations to those ledgers.

## Operations

Evidence ingestion runs from the orchestrator worker, using its existing server-only credentials.
The `modoo-reconcile-*` scripts validate original hashes, bank footer totals, unique keys, source relationships, and unchanged cost ledgers before insertion.
The import is insert-only on existing evidence keys and conditionally updates only previously unmatched source-line associations.
It never creates live orders or sends customer notifications.
Source files, payloads, operational snapshots, and credentials are excluded from this public repository.

## Verification

- `supabase/tests/cost_reconciliation_rls.sql` verifies each existing application role against all private evidence tables.
- `lib/cost-reconciliation-access.test.ts` verifies rejection before evidence queries.
- `lib/cost-reconciliation.test.ts` verifies cash/refund arithmetic and the separation of estimated allocations from final profit.
- Source hashes and legacy cost-ledger hashes are checked by the orchestrator importer.

The additive migration is registered under the same version as the remote database history.
