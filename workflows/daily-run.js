export const meta = {
  name: 'daily-run',
  description: 'Master daily orchestrator — runs morning briefing, then conditionally chains social listening and competitor intelligence based on what the briefing finds.',
  phases: [
    { title: 'Morning Briefing', detail: 'Listening digest + scheduled posts + content gaps' },
    { title: 'Social Listening', detail: 'Triggered if HOT mentions detected' },
    { title: 'Competitor Intel', detail: 'Triggered if competitor activity detected' },
    { title: 'Summary', detail: 'Daily summary posted to Slack' },
  ],
}

// args: { date: "YYYY-MM-DD" }
const date = args?.date ?? 'today'
const BASE = 'D:\\AI Content Agent\\workflows'

// ── Phase 1: Morning Briefing (always runs) ──────────────────────────────────
phase('Morning Briefing')
log(`Starting daily run for ${date}`)

const briefing = await workflow({ scriptPath: `${BASE}\\morning-briefing.js` }, { date })

const hotMentions = briefing?.analysis?.hot_mentions ?? briefing?.hot_mentions ?? 0
const hasCompetitorActivity = (briefing?.analysis?.recommended_posts?.length ?? 0) > 0

log(`Briefing done — ${hotMentions} HOT mentions, competitor check: ${hasCompetitorActivity}`)

// ── Phase 2: Social Listening (only if HOT mentions) ────────────────────────
let listeningResult = null

if (hotMentions > 0) {
  phase('Social Listening')
  log(`${hotMentions} HOT mentions found — running full social listening...`)
  listeningResult = await workflow({ scriptPath: `${BASE}\\daily-social-listening.js` }, { date })
  log(`Listening done — ${listeningResult?.total_mentions ?? 0} mentions classified, ${listeningResult?.responses_drafted ?? 0} responses drafted`)
} else {
  log('No HOT mentions — skipping deep social listening')
}

// ── Phase 3: Competitor Intel (runs daily — always useful) ───────────────────
phase('Competitor Intel')
log('Running competitor intelligence...')
const competitorResult = await workflow({ scriptPath: `${BASE}\\daily-competitor-intelligence.js` }, { date })
log(`Competitor done — ${competitorResult?.counter_posts_generated ?? 0} counter-posts generated`)

// ── Phase 4: Daily Summary ───────────────────────────────────────────────────
phase('Summary')

const summary = await agent(
  `Post a concise daily run summary to Slack using the Slack MCP tool (slack_post_message).
Find the marketing/content channel (#marketing, #content-team, or #social-media).

Message:
*ملخص اليوم — ${date}*

البريفينج: ${briefing?.analysis?.scheduled_today ?? 0} منشور مجدول، ${briefing?.analysis?.missing_platforms?.length ?? 0} منصة ناقصة
${hotMentions > 0 ? `الإشارات الساخنة: ${hotMentions} إشارة — تم تحليلها وحفظ الردود للمراجعة` : 'لا توجد إشارات ساخنة اليوم'}
المنافسون: ${competitorResult?.counter_posts_generated ?? 0} منشور counter-content جاهز في Drive

${briefing?.brief?.slice(0, 300) ?? ''}`,
  { label: 'daily-summary' }
)

return {
  date,
  briefing: briefing?.analysis,
  listening: listeningResult ? { mentions: listeningResult.total_mentions, hot: listeningResult.hot_mentions } : null,
  competitor: { posts_generated: competitorResult?.counter_posts_generated },
}
