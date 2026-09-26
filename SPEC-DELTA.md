# Historical finance and cost backfill delta

## Goal

Make the existing super-admin finance area useful for period-level revenue, expenditure, provisional gross profit, and margin while keeping evidence-backed historical manual jobs separate from live orders.

## Scope

- Backfill missing apparel cost only when each positive-quantity variant matches a current supplier-backed cost row; preserve positive existing amounts and label current-price estimates.
- Present the 29 reconstructed pre-system jobs as simple historical orders, grouped by work start month with observed receipts, costs, refunds, cash difference, and evidence.
- Show monthly trend and margin for live paid orders, with a clear warning for missing print/factory/shipping costs and VAT-basis differences.
- Super-admin only for all internal cost and historical finance data.

## Non-goals and safeguards

- Do not create operational orders, payment captures, purchase orders, or shipments from inferred history.
- Do not count unallocated bank transactions, supplier recoveries, or ERP entries as new revenue.
- Do not present historical cash difference as confirmed accounting profit.
- Do not overwrite a positive cost ledger row or erase original evidence.

## Acceptance

- Price backfill dry run equals applied count; rerun is idempotent.
- Historical monthly totals equal sums of the underlying cases; no double count with live orders.
- Live profit report displays period-level revenue, cost, gross profit, and provisional margin.
- Build, lint, and authorization checks pass.
