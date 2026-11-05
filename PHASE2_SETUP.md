# Phase 2 provider operations (safe defaults)

The existing AEVONE OS research queue, user-scoped Supabase RLS, and OSM discovery remain in place. `backend/worker.py` now calls an evidence-first provider orchestrator. No database migrations are required for this phase: records remain in `aevone_research_jobs.results` JSONB and can be saved to `aevone_leads` through the existing UI.

## Provider controls (server-side secrets only)

| Environment variable | Default | Effect |
|---|---|---|
| `AEVONE_ENABLE_APIFY_DATASET` | unset | Explicitly enable reading an existing Apify dataset |
| `APIFY_TOKEN` | unset | Apify bearer token in GitHub Actions Secrets |
| `APIFY_DATASET_ID` | unset | Identifier of a reviewed dataset holding the relevant public business research |
| `AEVONE_ALLOW_BILLABLE_APIFY` | unset | Gate for explicit Apify task runs; task execution is **not** wired to automatic queued jobs |
| `APIFY_TASK_ID` | unset | Preconfigured task identifier (verify Actor input schema, license, cost and budget before use) |
| `AEVONE_ALLOW_BILLABLE_APOLLO` | unset | Enables up to three domain-matched organization enrich calls per job; **may consume credits** |
| `APOLLO_API_KEY` | unset | Apollo API secret |

**Important:** `AEVONE_ALLOW_BILLABLE_APOLLO` must remain unset until pricing is reviewed and spending approved. `apify_task` exists as an isolated manual integration utility; the research worker intentionally does NOT launch Actors. The read-only dataset path cannot dynamically search arbitrary business queries unless a preconfigured external process has populated the dataset with relevant data. OSM is still the no-cost live discovery source, subject to external availability and usage rules.

## Worker execution

1. Authorized UI inserts an owner-scoped `queued` row using existing RLS.
2. GitHub Actions scheduled worker atomically claims row using server-side service credentials.
3. Free OSM discovery runs; optional existing Apify dataset is read if explicitly enabled.
4. Results are deduplicated by valid official domain (fallback name/city).
5. Optional Apollo organization enrichment runs only if explicitly enabled. No person/email addresses are inferred. Provider records remain **unverified** until supported by independently checked evidence.
6. Results and count are persisted into the existing queue table. Company cards show provider-specific citations. CRM save remains a separate user action.

## Validation

`python -m unittest discover -s tests -p 'test_*.py' -v`
`python -m compileall -q backend tests`
`node --check web/lead.mjs`

Tests use mocked providers and synthetic company examples. No billable requests, credentials, production writes or external API access are required for CI.

**Known limits:** There is no guaranteed end-to-end live lead response until an applicable dataset is configured or OSM succeeds. Apify dataset results are source-listed only, not verified, and must be checked for relevance. No ZoomInfo access is assumed. Manual approval is required before adding actual paid discovery automation.
