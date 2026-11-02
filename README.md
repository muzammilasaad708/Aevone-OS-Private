# AEVONE OS v3 · Cloud Research Foundation

**Existing authentication, dashboard, AI Brain and CRM preserved.** Replaces manual-first Lead Generation landing page with a conversational search and source-backed company card UI, adds categorized connector registry, and includes a queued backend research worker.

## What is deployed / what is not

- Supabase: `public.aevone_research_jobs` migration has been applied to your connected Lead-Management-System project. Existing tables were not deleted.
- Local frontend: runnable using START_AEVONE_OS.bat (Python required). Supabase login is the existing Owner account.
- GitHub Actions: workflow code supplied at `.github/workflows/research.yml`. **Not yet uploaded to / enabled in a private repository.** No cloud research jobs will process until a GitHub repository with the workflow and required Actions secrets is configured.
- Cloudflare Worker: gateway source supplied at `backend/cloudflare-worker.mjs`. **Not yet deployed**, therefore no live Cloudflare URL. Existing browser application talks to Supabase directly using user JWT + RLS; adding the Worker is an optional gateway improvement.
- Discovery: scheduled worker currently uses public OpenStreetMap Overpass directory listings, subject to source availability/rate limits. It does **not** scrape Google Maps or guarantee any amount of matches. All returned contacts are explicitly unverified.
- Apollo, Apify, ZoomInfo, Agent Reach and third-party GitHub repos are listed in Connector Registry as **not deployed** until separately assessed, authorized and implemented. Saving provider keys is not an adapter.
- AI Brain remains its separate model chat module, **not yet a reasoning step executed automatically by the scheduled research worker**. Natural-language parsing in this phase is deterministic and deliberately conservative.

## Windows

1. Extract this ZIP and close the old launcher.
2. Run `START_AEVONE_OS.bat`, open http://localhost:4173.
3. Log into the existing Supabase Owner account, then choose Lead Generation.
4. Type `Find 15 bakeries in Karachi`. The job will initially be `queued`. It requires GitHub Actions to run for results to appear.
5. Click ↻ in Research history after the job worker has completed. Company cards then show source URLs; save to CRM is optional.

## Activate scheduled cloud worker using your private GitHub repository

1. Create/choose a **private** GitHub repository with Actions enabled. Upload the contents of this project **without** `.env`, `*.key`, `.pem`, personal API keys or any credentials. GitHub's connector does not deploy the files automatically merely because this ZIP exists.
2. GitHub → Settings → Secrets and variables → Actions → New repository secret:
   - `SUPABASE_URL` = your project public URL (not sensitive).
   - `SUPABASE_SERVICE_ROLE_KEY` = your project's server-only service-role secret. **Never put this in web/config.js, issues, commits, chat or screenshots.**
3. GitHub → Actions → `AEVONE Scheduled Research` → Run workflow. Then after validating a small job, leave scheduled runs enabled. Cron is every 30 minutes and can be delayed; not a continuously running 24/7 server.
4. Workflow code caps runs at 3 queued jobs per invocation and 8 minutes. Overpass may decline requests; jobs then show `failed` and the UI does not invent results.

## Cloudflare deploy (optional free gateway / separate from Pages hosting)

- From backend folder run `npx wrangler deploy` **only after** Cloudflare login, account setup and configuration are complete.
- Set Worker environment variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_ORIGIN` in the Worker dashboard; never set a service-role key in a public website.
- For frontend hosting: deploy `web/` as static files to a private-access-gated Pages site. A URL without authentication protecting the site is still public, although Supabase RLS protects data if correctly configured. Review the Supabase Auth redirect URL settings.
- This release contains the Worker endpoints, but browser currently uses Supabase directly; Cloudflare gateway is not wired as the mandatory request path until its URL and Access policy are configured.

## Testing

Run `python tests/research_12x1000.py` and `node tests/check.mjs`, plus JavaScript syntax checks. 12x1,000 deterministic assertions are unit simulations, **not 12,000 live API calls**, and do not prove all external third-party services work. No database keys or live scraping used during these stress tests.

## Limitations / safety

No API keys are embedded in this ZIP. Supabase public publishable key in `web/config.js` is expected, not a secret. Your earlier conversation included many real keys, so do not put those keys in a repo. No founder/CEO names or contact details are invented. OpenStreetMap data may be missing, outdated or inaccurate, especially social links. Verify before outreach. Browser and backend check data sources and permissions but cannot promise zero bugs or uninterrupted free hosting.
