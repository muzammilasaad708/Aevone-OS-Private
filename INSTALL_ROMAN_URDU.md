# AEVONE OS v3.2: Research Worker Fix

Yeh **existing private Aevone-OS-Private repo ke liye targeted upgrade** hai. Pura OS replace nahi karta. `web/` ya `sql/` folders delete mat karna. Supabase ki existing tables bhi delete nahi karni.

## Files jo replace/add karne hain

- `backend/planner.py` replace
- `backend/worker.py` replace
- `.github/workflows/research.yml` replace
- `tests/test_research_worker.py` add
- `tests/test_research_scenarios.py` add

1. GitHub Desktop mein **Aevone-OS-Private > Repository > Show in Explorer** kholo.
2. ZIP extract karo. Andar ki `.github`, `backend`, aur `tests` directories **existing repo root mein merge** karo. File replacement ka prompt aaye to Yes.
3. Kisi bhi `.env`, secret key, `.git` folder ko ZIP se copy karne ki zaroorat nahi. Is ZIP mein koi secret nahi.
4. GitHub Desktop mein changed files review karo. `Commit to main`, phir `Push origin`.
5. GitHub > Actions > **AEVONE Scheduled Research** > `Run workflow` dabao.
6. Run ke `research > Process queued research` log mein `Queued=N Processed=N` dekho.
7. AEVONE OS > Lead Generation > existing research history **refresh** karo. Complete jobs mein company cards dikhni chahiye, agar OpenStreetMap ke paas matching listings hain.

## Local tests

Repo root par terminal kholo:

```bash
python -m unittest discover -s tests -p 'test_research*.py' -v
```

## Kya active hai, kya nahi?

- Supabase database and job queue: existing schema reuse.
- **OpenStreetMap business discovery**: live integration, worker ke through.
- **Apollo/Apify/ZoomInfo**: abhi active nahi. Provider API authorization, appropriate endpoints, quotas, adapter code, and actual tests required.
- Google Maps / LinkedIn / email scraping GitHub repositories: **listing only**. ZIP unka code install ya execute nahi karti.
- AI Brain green dots/`Credential Found`: keys milna successful completion test nahi hai. AI module is patch mein modify nahi hota.

## Troubleshooting

- `Queued=0 Processed=0`: Supabase mein koi queued job nahi. Web UI mein fresh research prompt bhejo, phir workflow run karo. Purani failed job automatically queued nahi banti.
- `Discovery provider temporarily unavailable`: Overpass API overloaded ya unavailable ho sakti hai. Dusri query chalao ya later retry. Worker server pe live network zaroori hai.
- `Missing private worker configuration`: GitHub Actions secrets `SUPABASE_URL` aur `SUPABASE_SERVICE_ROLE_KEY` set hain ya nahi check karo. Secret values logs mein mat bhejna.
- `0 directory listings returned`: Data source mein result absent ho sakta hai. Iska matlab all internet sources searched nahi hain.
- Agar 30 min scheduling delay ho: Actions schedules exact-time guarantee nahi karte. Manual `Run workflow` available hai.

## Security

GitHub repository private rakho. Credentials sirf encrypted GitHub Actions secrets mein rakhna. Supabase service-role key frontend mein nahi jana chahiye. Jo API tokens chat mein share hue hain unhein source code mein paste na karo. Multiple credentials pehle publicly exposed ho chuke hain, isliye provider dashboards mein unka access review karna important hai.

## Validation

- 8 worker unit tests + 12 separate query scenarios.
- Tests real APIs ko call nahi karte; they validate parsing, normalization and job flow without exhausting quotas.
- **Live Supabase/Overpass end-to-end deployment is not claimed by this ZIP.** Woh code push aur real workflow run se confirm hoga.
