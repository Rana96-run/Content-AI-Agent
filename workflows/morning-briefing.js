export const meta = {
  name: 'morning-briefing',
  description: 'Daily social media manager morning briefing — listening digest, scheduled posts today, content gaps, recommended actions. Run every morning.',
  phases: [
    { title: 'Listen', detail: 'Pull latest social listening results' },
    { title: 'Schedule', detail: 'Check what is scheduled in HubSpot today' },
    { title: 'Gaps', detail: 'Identify missing content slots' },
    { title: 'Brief', detail: 'Synthesise into a clear Arabic action brief' },
  ],
}

const date = args?.date ?? 'today'
const RAILWAY = 'https://somaa-ai-agent-production.up.railway.app'

// ── Phase 1: Latest listening results ───────────────────────────────────────
phase('Listen')

const [listeningRaw, scheduledRaw] = await parallel([
  async () => await agent(
    `Fetch the latest social listening results using Bash:
curl -s "${RAILWAY}/api/agent/listening/latest"

Return the full JSON as-is.`,
    { label: 'fetch-listening' }
  ),
  async () => await agent(
    `Fetch today's scheduled social posts from HubSpot using Bash:

curl -s "https://api.hubapi.com/marketing/v3/social/broadcasts?state=SCHEDULED&limit=20" \\
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"

Return the JSON response — list of broadcasts with their scheduledAt, channelId, content.body, and id.`,
    { label: 'fetch-scheduled' }
  ),
])

// ── Phase 2 & 3: Analyse gaps ────────────────────────────────────────────────
phase('Gaps')

const GAP_SCHEMA = {
  type: 'object',
  properties: {
    hot_mentions: { type: 'array', items: { type: 'string' } },
    scheduled_today: { type: 'number' },
    platforms_covered: { type: 'array', items: { type: 'string' } },
    missing_platforms: { type: 'array', items: { type: 'string' } },
    content_gap: { type: 'string' },
    urgent_action: { type: 'string' },
    recommended_posts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          platform: { type: 'string' },
          funnel_stage: { type: 'string' },
          hook_angle: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
  required: ['scheduled_today', 'urgent_action', 'recommended_posts'],
}

const analysis = await agent(
  `You are the social media manager for Qoyod — Saudi cloud accounting SaaS.

Today: ${date}

LISTENING DATA (last 6 hours):
${JSON.stringify(listeningRaw, null, 2).slice(0, 2000)}

SCHEDULED POSTS TODAY:
${JSON.stringify(scheduledRaw, null, 2).slice(0, 2000)}

Your tasks:
1. Identify any HOT mentions that need a response today (complaints, questions, viral content about ZATCA/e-invoicing)
2. Count how many posts are scheduled today and which platforms are covered
3. Identify missing platforms — ideal daily coverage: Instagram (2 posts), LinkedIn (1), TikTok (1)
4. Identify the biggest content gap or opportunity right now
5. Recommend 1-3 posts to create and schedule today, each with platform, funnel stage, and hook angle

Return structured JSON analysis.`,
  { label: 'analyse-gaps', schema: GAP_SCHEMA }
)

// ── Phase 4: Synthesise Arabic brief ────────────────────────────────────────
phase('Brief')

const brief = await agent(
  `أنت مدير وسائل التواصل الاجتماعي لقيود.

بناءً على هذا التحليل:
${JSON.stringify(analysis, null, 2)}

اكتب بريفينج صباحي موجز بالعربية السعودية — بدون عناوين HTML أو نقاط مُنسقة، فقط نثر مباشر في فقرتين:
- الفقرة 1: ما الوضع الآن (إشارات مهمة، ما هو مجدول اليوم)
- الفقرة 2: ما تحتاج تسويه اليوم وليش (الإجراءات الموصى بها)

ثم أضف قائمة "المهام اليوم" بالعربية، مثل:
المهام اليوم:
- ...
- ...`,
  { label: 'write-brief' }
)

log(`Brief ready — ${analysis?.scheduled_today ?? 0} posts scheduled, ${analysis?.missing_platforms?.length ?? 0} gaps`)

return {
  date,
  brief,
  analysis,
  raw: { listening: listeningRaw, scheduled: scheduledRaw },
}
