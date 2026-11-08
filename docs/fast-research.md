# AEVONE fast research: installation and boundaries

- Cached, source-linked Karachi OSM records are read before Overpass. A warm cache with enough entries skips external discovery.
- The Karachi cold fallback uses shorter, bounded Overpass timeouts; no fabricated leads or paid provider calls.
- The Lead Generation page polls pending jobs every 15 seconds while visible and preserves the current prompt draft.
- Authenticated Supabase `aevone-dispatch` can trigger the existing GitHub workflow immediately, with the existing 30-minute schedule unchanged as free-budget backup.

## One-time deployment (only after PR CI passes)
1. Apply additive `sql/05_research_dispatch.sql` to the existing Supabase project.
2. Create a **fine-grained GitHub token** limited to `Aevone-OS-Private`, permission **Actions: Read and write**. Set it as the Supabase Edge Function secret `GITHUB_DISPATCH_TOKEN` (never source code, frontend, logs, or chat).
3. Deploy `supabase/functions/aevone-dispatch/index.ts` as a JWT-protected Edge Function. Add any production site origins to secret `AEVONE_ALLOWED_ORIGINS`. Localhost:4173 is already allowed.
4. Start the updated AEVONE UI. Job creation is RLS-authorized; the dispatch function authenticates the user, checks active membership and job ownership, then atomically claims the job before calling GitHub workflow_dispatch. If missing/unavailable, the job stays queued for the scheduled worker.
5. Verify GitHub Actions started; verify Supabase row transitions queued -> running -> complete with actual source URLs, and UI updates automatically.

Never interpret offline green CI as live connectivity proof. International searching needs separate country-aware source mapping. GitHub itself can delay dispatch. No Apollo/Apify billable operation is enabled.
