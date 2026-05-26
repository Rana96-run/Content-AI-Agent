# Qoyod Creative OS — Claude Rules

## DEPLOYMENT: GitHub → Railway (CRITICAL)

**Railway auto-deploys from GitHub. `railway up` does NOT update the live server.**

### Rules — enforced every session

1. **Before any code change**, check unpushed commits:
   ```
   git log origin/main..HEAD --oneline
   ```
   If output is non-empty → push first, then make changes.

2. **To deploy**, always use:
   ```
   git push origin main
   ```
   Never use `railway up` — it uploads to a shadow deployment that Railway ignores in favour of the GitHub-linked auto-deploy.

3. **After pushing**, wait ~2 min then verify the live commit hash matches:
   ```
   railway status --json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['environments']['edges'][0]['node']['serviceInstances']['edges'][0]['node']['latestDeployment']['meta']['commitHash'][:7])"
   ```
   Compare against `git rev-parse --short HEAD`.

4. **Never mix** `railway up` + GitHub deploys in the same session — Railway will serve whichever built last, making it impossible to know what's live.

## REVIEW & TEST: enforced after every edit (CRITICAL)

This is a live production tool used daily by the marketing team. A single broken
deploy hits real users. Never push code that hasn't been verified locally.

### Before commit — mandatory checklist

1. **Build the client every time** — even for "tiny" changes:
   ```
   npm --prefix client run build
   ```
   If it errors, fix before staging. If you used Bash/Python to delete or
   restructure JSX/JS by line numbers, the build is the only thing that catches
   over-deletion or broken closing braces.

2. **Typecheck the server** when touching files in `server/src/`:
   ```
   cd server && npm run typecheck
   ```
   Pre-existing errors elsewhere are OK; new errors in your edited file are not.

3. **Read what you wrote** — when editing more than ~20 lines:
   - Re-read the file with the Read tool around the edit zone
   - Check that imports, brackets, and component structure are intact
   - For JSX deletes: confirm tab order is preserved by grepping `tab===.X.`
     and listing every tab in TABS — they must match.

4. **Test the actual change path** before pushing:
   - Server route changes → curl the endpoint with a real payload
   - Client UI → if you cannot exercise it, at least verify build size is
     reasonable (a 30%+ unexpected drop = something is missing)

### After deploy — mandatory verification

5. **Wait for Railway to flip to SUCCESS** (not just push):
   ```
   until [ "$(railway status --json | python3 -c "...status...")" = "SUCCESS" ]; do sleep 10; done
   ```
6. **Hit the affected endpoint live** — for AI features, curl `/api/ai-health`
   and `/api/generate` with a tiny payload. Confirm the response is sane.

7. **Tell the user EXACTLY which screens to test and how to refresh.** They
   cannot see what you saw locally — assume the browser cache is stale.

### Failure mode to avoid

If you deleted code by line range with `sed`, `python`, or any non-Edit tool,
you MUST re-grep for symbols that should still exist (tab names, function
names, callback names) before pushing. Over-deletion is silent — it builds
fine and only shows up as black screens to the user.

## Stack

- **Server**: `server/` — Express + TypeScript, port 8080
- **Client**: `client/` — React (Vite), proxied through server in prod
- **Live URL**: https://somaa-ai-agent-production.up.railway.app
- **Repo**: https://github.com/Rana96-run/Content-AI-Agent

## Key files

| File | Purpose |
|------|---------|
| `server/src/routes/generate.ts` | 3-provider AI proxy (Anthropic→OpenAI→Gemini) with retry, dedup, layered prompt enrichment (Brand Law + Competitor Context + Customer Voice + ZATCA + Pattern Library) |
| `server/src/routes/competitor-ads.ts` | Apify FB+IG capture, jina Google ads, YouTube Data API, manual monitor trigger |
| `server/src/routes/hypothesis.ts` | POST /api/hypothesis/log → Sheet "Hypothesis Ledger" tab |
| `server/src/routes/editor-qa.ts` | 11-rule pre-publish checklist (master prompt §13) |
| `server/src/routes/reports.ts` | Daily Pulse + Monthly Strategic Review (master prompt §9) |
| `server/src/routes/fetch-url.ts` | Generic URL content fetcher (X/LinkedIn/web) via r.jina.ai |
| `server/src/lib/competitor-monitor.ts` | Sunday 09:00 UTC scheduled monitor → Sheet + Slack + Google Doc |
| `server/src/lib/competitor-weekly-report.ts` | Diff/AI-summary/Slack-blocks formatter (incl. proven_winners >30d) |
| `server/src/lib/competitor-doc-renderer.ts` | HTML→Google Doc weekly visual report |
| `server/src/lib/competitor-context.ts` | Synthesizes scrape into prompt-injectable brief |
| `server/src/lib/customer-voice.ts` | App Store + Play Store + X reviews → pain quotes (D2) |
| `server/src/lib/zatca-watcher.ts` | ZATCA news + tweets → regulatory awareness (D3) |
| `server/src/lib/pattern-library.ts` | Reads WIN-tagged hypotheses → few-shot examples (D1) |
| `server/src/lib/qoyod-brand-law.ts` | Compressed brand law from Master Prompt v1.1 |
| `server/data/qoyod-master-prompt.md` | Source of truth — full 535-line operating prompt |
| `server/src/lib/agent-personas.ts` | 6 personas: social, content, cro (paid media), email, editor, orchestrator |
| `client/src/pages/CreativeOS.jsx` | Main UI: 7 tabs (Content, Campaign, Calendar, Email/WA, Market Watch, Library, ICP) + Quick Agent terminal + Hypothesis log modal |

## Focus areas (no graphic design)

The system is intentionally focused on:
1. **Social media analysis** — performance trends, what's working
2. **Social media monitoring/listening** — competitor weekly auto-reports
3. **Content creator/writer** — ad copy, captions, calendars, sequences
4. **Paid media analyst** — ad library scraping, counter-creative strategy

Graphic Designer tab + persona were removed (Apr 28, 2026). Image generation
and Canva/Miro design integrations are NOT part of the active workflow.
