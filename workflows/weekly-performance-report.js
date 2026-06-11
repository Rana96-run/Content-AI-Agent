export const meta = {
  name: 'weekly-performance-report',
  description: 'Weekly social media performance report — HubSpot campaign analytics + listening trends + competitor moves + next week recommendations.',
  phases: [
    { title: 'Analytics', detail: 'Pull HubSpot campaign + social analytics' },
    { title: 'Listening', detail: 'Summarise week of listening data' },
    { title: 'Competitors', detail: 'Pull weekly competitor move summary from Drive' },
    { title: 'Report', detail: 'Write Arabic strategic report and save to Drive' },
  ],
}

const date = args?.date ?? 'this week'
const RAILWAY = 'https://somaa-ai-agent-production.up.railway.app'

// ── Phase 1 & 2: Analytics + Listening in parallel ─────────────────────────
phase('Analytics')

const [hubspotData, listeningData, competitorData] = await parallel([
  async () => await agent(
    `Fetch social performance data from HubSpot for the past 7 days using the Bash tool.

Step 1 — Get published broadcasts (posts) from the last 7 days:
curl -s "https://api.hubapi.com/marketing/v3/social/broadcasts?state=PUBLISHED&limit=50" \\
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"

Step 2 — For each broadcast, note: channelId, content.body (first 80 chars), publishedAt, engagement metrics if available.

Step 3 — Get campaign analytics using the HubSpot MCP tool if available, or via:
curl -s "https://api.hubapi.com/analytics/v2/reports/social-media/total?startDate=${date}&endDate=${date}&breakdown=SOCIAL_CHANNEL" \\
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"

Return JSON: { total_posts: number, posts: [...], top_performing: [...], total_engagement: number }`,
    { label: 'hubspot-analytics' }
  ),

  async () => await agent(
    `Fetch the latest social listening results and summarise the week's key mentions:
curl -s "${RAILWAY}/api/agent/listening/latest"

Summarise: top 3 brand mentions, top 3 ZATCA/regulatory updates, any competitor moves spotted.
Return JSON: { brand_mentions: number, zatca_updates: [...], market_signals: [...], sentiment_trend: string }`,
    { label: 'listening-summary' }
  ),

  async () => await agent(
    `Search Google Drive for this week's competitor capture documents (files named "Counter-Content Brief" or "Daily Competitor Capture").
Use the Google Drive MCP tool to search recent files.
Read the most recent 3 files and extract: which competitors were most active, what angles they used, what Qoyod counter-posts were generated.
Return JSON: { most_active_competitor: string, dominant_angle: string, counter_posts_created: number, key_insight: string }`,
    { label: 'competitor-summary' }
  ),
])

// ── Phase 3: Write strategic report ─────────────────────────────────────────
phase('Report')

const report = await agent(
  `أنت مدير وسائل التواصل الاجتماعي لقيود — Saudi cloud accounting SaaS.

اكتب تقرير الأداء الأسبوعي بالعربية السعودية بناءً على هذه البيانات:

بيانات HubSpot الأسبوعية:
${JSON.stringify(hubspotData, null, 2).slice(0, 2000)}

ملخص رصد المنصات:
${JSON.stringify(listeningData, null, 2).slice(0, 1000)}

ملخص تحركات المنافسين:
${JSON.stringify(competitorData, null, 2).slice(0, 1000)}

التقرير يتضمن:
1. ملخص تنفيذي (فقرة واحدة — الأرقام الرئيسية والاستنتاج الأبرز)
2. أداء المنصات (إنستغرام / لينكدإن / تيك توك — منشورات، تفاعل، مقارنة بالأسبوع الماضي)
3. أبرز إشارات السوق (من رصد تويتر + الويب)
4. تحركات المنافسين هذا الأسبوع
5. الفرص غير المستغلة (3 فرص محددة مع تبرير)
6. توصيات الأسبوع القادم (3 أولويات واضحة مع الهايبوثيسيس لكل منها)

الأسلوب: مهني موجز، باللهجة السعودية، بدون تزويق.`,
  { label: 'write-report' }
)

// Save to Drive
await agent(
  `Save this weekly performance report to Google Drive as a Google Doc titled "Weekly SM Report — ${date}".

Report content:
${report}`,
  { label: 'save-report' }
)

return { date, report, analytics: hubspotData, listening: listeningData, competitors: competitorData }
