# Changelog

## Unreleased

- Isolate factory settlements from shared order records while preserving stored amounts.
- Restrict internal costs to super administrators and factory prices to the assigned factory.
- Remove internal freight amounts from ordinary administrator and public-link responses.
- Add database role checks and financial-access regression tests.

## 0.1.1 — 2026-09-07

- Separate sales grain from date range with daily, weekly and monthly history.
- Exclude future buckets, preserve observed zero values, expose missing coverage and partial periods.
- Unify confirmed revenue and calendar comparisons across sales and advertising analytics.
- Deduplicate Meta purchase aliases and distinguish MER, UTM ROAS and platform ROAS.
- Aggregate visitor events in restricted database RPCs and cache reporting reads.
- Improve mobile charts, keyboard access, tab state and lazy creative images.
- Add 31 analytics regression tests and document the reporting contract.
