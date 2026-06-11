# Qoyod Cowork — Social Media Manager Workflows

All automation lives here. Cowork is the brain. n8n is only needed for external event triggers.

## Architecture

```
Claude Code Cowork (this folder)
    ├── Generates content (Saudi dialect, Qoyod voice)
    ├── Publishes to Instagram directly
    ├── Schedules via HubSpot Social
    ├── Monitors competitors daily
    ├── Listens to Twitter/X every 6h
    └── Produces weekly performance reports

Railway Server (always-on)
    ├── Runs social listener every 6h (data collection)
    ├── Runs competitor capture daily 07:00 UTC
    └── Exposes API endpoints for cowork to trigger

n8n (external triggers only — optional)
    ├── New HubSpot deal → trigger content brief
    ├── Form submission → generate ad copy
    └── Daily cron → POST /api/agent/listening/run-now
```

---

## Workflows

### Daily Operations

| Workflow | When to run | What it does |
|----------|-------------|--------------|
| `morning-briefing.js` | 09:00 Saudi daily | Listening digest + scheduled posts + action list |
| `daily-competitor-intelligence.js` | 11:00 Saudi daily | Competitor posts → analysis → counter-content |
| `daily-social-listening.js` | 09:45 Saudi daily | Twitter/web keywords → classify → response drafts |

**Run any of these:**
```
Workflow({ scriptPath: "D:\\AI Content Agent\\workflows\\morning-briefing.js", args: { date: "2026-06-12" } })
```

### Publishing

| Workflow | Args required | What it does |
|----------|--------------|--------------|
| `schedule-hubspot-social.js` | `posts[]`, `date` | Schedules posts across IG/LI/FB in HubSpot |

**Schedule example:**
```
Workflow({
  scriptPath: "D:\\AI Content Agent\\workflows\\schedule-hubspot-social.js",
  args: {
    date: "2026-06-12",
    posts: [
      {
        caption: "...",
        platform: "instagram",
        scheduled_time: "2026-06-12T09:00:00+03:00",
        image_url: "https://..."
      }
    ]
  }
})
```

### Reporting

| Workflow | When to run | What it does |
|----------|-------------|--------------|
| `weekly-performance-report.js` | Sunday morning | HubSpot analytics + listening trends + recommendations |

---

## Required Environment Variables (Railway)

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API ✅ already set |
| `APIFY_TOKEN` | Twitter/Instagram scraping ✅ already set |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot Social scheduling ✅ already set |
| `INSTAGRAM_ACCOUNT_ID` | Instagram Business Account ID ⚠ add if publishing direct |
| `META_ACCESS_TOKEN` | Facebook/Instagram long-lived token ⚠ add if publishing direct |
| `FACEBOOK_PAGE_ID` | Facebook Page linked to IG ⚠ add if publishing direct |

---

## Social Media Manager Daily Checklist

1. **09:00** — Run `morning-briefing.js` → read action list
2. **09:30** — Review counter-posts from yesterday's competitor capture in Drive
3. **10:00** — Approve or edit 1-2 posts → run `publish-instagram.js` or `schedule-hubspot-social.js`
4. **11:00** — `daily-competitor-intelligence.js` fires automatically (CronCreate)
5. **17:00** — Check for any HOT Twitter mentions via `daily-social-listening.js`
6. **Sunday** — Run `weekly-performance-report.js`

---

## Cowork vs n8n Decision Guide

| Task | Use |
|------|-----|
| Generate content | Cowork |
| Publish to Instagram | Cowork (`publish-instagram.js`) |
| Schedule posts | Cowork (`schedule-hubspot-social.js`) |
| Daily monitoring | Cowork (CronCreate) |
| Weekly report | Cowork |
| External webhook trigger (new lead, form, etc.) | n8n → calls Railway endpoint → Cowork picks up |
| Complex multi-app routing (50+ tools) | n8n |
