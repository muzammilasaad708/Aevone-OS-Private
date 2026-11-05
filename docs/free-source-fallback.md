# AEVONE OS: zero-credit Karachi source fallback

The research worker prioritizes current OpenStreetMap Overpass listings. When
live Overpass or the explicitly enabled read-only Apify dataset cannot produce
enough source-backed results, the worker uses a free OpenStreetMap Pakistan
extract from Geofabrik. It never fabricates owners, emails or business names.

## How it works

1. Only a real queued Supabase research job starts the worker. The job's query
   is parsed into a supported industry, city and capped result count.
2. The worker attempts bounded public Overpass discovery, optionally reads
   an already existing Apify dataset if enabled, then consults a local
   Pakistan OSM snapshot when fewer than the requested records are found.
3. The extract is downloaded from
   https://download.geofabrik.de/asia/pakistan-latest.osm.pbf, with a 230 MB
   size limit and 120-second download deadline, then processed by pinned
   pyosmium into source-linked Karachi business objects.
4. Only the small, filtered JSON cache is retained; the bulky PBF is deleted.
   GitHub Actions caches the derived JSON for the current UTC ISO week.
   Cache age over 14 days is rejected.
5. Records are always unverified source listings with an actual
   OpenStreetMap node/way URL. Source links and provenance are preserved
   through the existing Supabase job results and company card UI.

## Source license and limitations

- Data © OpenStreetMap contributors, available under the ODbL.
  See https://www.openstreetmap.org/copyright. Geofabrik free extracts:
  https://download.geofabrik.de/asia/pakistan.html.
- Current snapshot fallback covers Karachi (using an approximate
  bounding box). Other Pakistani cities continue to depend on live Overpass
  or a separately approved source.
- Overpass availability, Geofabrik downloads, GitHub Actions runner minutes,
  and source completeness are not guaranteed. Downloading the extract
  uses free open data but does consume traffic and CI runtime.
- Hotel source tagging is tourism=hotel (not amenity=hotel). User typo
  hotal is recognized without widening the planner's allowed categories.
- The source data does not independently verify emails, decision-makers,
  phone numbers, or current trading status. Never promote source-listed
  fields to verified without additional evidence.
- No Apify Actor run or Apollo enrichment is enabled by this change.
  Their credit-consuming paths remain opt-in.
- No Supabase tables, credentials or existing failed job rows are modified.

## Safe deployment verification

1. Review the PR's offline CI tests. Merge only after all checks pass.
2. Open GitHub Actions > AEVONE Scheduled Research > Run workflow on main.
   The existing valid "Find 10 hotels in Karachi, Pakistan" queued row
   can be processed without resubmitting it.
3. Open Supabase > public.aevone_research_jobs. Inspect the matching job's
   status, result_count, error and results. Genuine completion requires
   status=complete and non-empty source-linked results.
4. Open AEVONE Lead Generation; refresh research history. The result cards
   must display the actual source URL, provider and Unverified status.
5. If the snapshot cannot download/parse, the job must fail visibly with
   sanitized diagnostics. Do not mark the research successful with zero leads.

The code's unit tests use synthetic OSM XML and cached fixture JSON. They do
not by themselves prove a live Geofabrik download or an end-to-end Supabase
job: verify those explicitly in the post-merge workflow before claiming it works.
