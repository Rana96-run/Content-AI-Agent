export const meta = {
  name: 'daily-social-listening',
  description: 'Twitter/X-first social listening for Qoyod brand, ZATCA, e-invoice, and market keywords — web search supplementary for regulatory news only',
  phases: [
    { title: 'Listen', detail: 'Twitter/X primary — web search only for ZATCA/regulatory keywords' },
    { title: 'Classify', detail: 'Score and classify each mention by urgency and type' },
    { title: 'Respond', detail: 'Draft response suggestions for hot mentions' },
    { title: 'Save', detail: 'Save digest to Drive and flag hot mentions to Slack' },
  ],
}

const RAILWAY = 'https://somaa-ai-agent-production.up.railway.app';

// Keyword groups — add/remove terms here
const KEYWORD_GROUPS = {
  brand: ['قيود', 'qoyod', 'برنامج قيود', 'تطبيق قيود'],
  zatca: ['هيئة الزكاة والضريبة', 'هيئة الزكاة', 'ZATCA', 'الفاتورة الإلكترونية', 'المرحلة الثانية للفاتورة', 'فوترة إلكترونية'],
  market: ['وزارة التجارة السعودية', 'برنامج محاسبة', 'نظام محاسبي', 'فاتورة معتمدة', 'ضريبة القيمة المضافة VAT سعودية'],
  competitors: ['دفترة', 'daftra', 'rewaa ريوا', 'wafeq وافق', 'smacc', 'دفاتر'],
}

const MENTION_SCHEMA = {
  type: 'object',
  properties: {
    mentions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          source: { type: 'string' },
          url: { type: 'string' },
          keyword_group: { type: 'string' },
          sentiment: { type: 'string' },
          urgency: { type: 'string' },
          type: { type: 'string' },
          qoyod_relevant: { type: 'boolean' },
        },
        required: ['text', 'keyword_group', 'urgency', 'type'],
      },
    },
    total_found: { type: 'number' },
    hot_count: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['mentions', 'summary'],
}

// ── Phase 1: Trigger Railway social listener ────────────────────────────────
phase('Listen')

// Trigger Railway's listener (it searches Twitter via Apify + web via Jina)
const triggerResult = await agent(
  `Use the Bash tool to:
1. Trigger the social listening run on Railway:
   curl -s -X POST "${RAILWAY}/api/agent/listening/run-now" -H "Content-Type: application/json"
2. Wait 90 seconds for it to complete:
   sleep 90
3. Fetch the latest listening results:
   curl -s "${RAILWAY}/api/agent/listening/latest"

Return the full JSON from step 3.`,
  { label: 'trigger-listener' }
)

log(`Listener triggered. Got ${typeof triggerResult === 'string' ? triggerResult.length : JSON.stringify(triggerResult).length} chars of data`)

// ── Phase 2: Classify and score mentions ───────────────────────────────────
phase('Classify')

const classified = await agent(
  `You are a social media intelligence analyst for Qoyod — Saudi cloud accounting SaaS.

Raw listening data from today:
${JSON.stringify(triggerResult, null, 2).slice(0, 5000)}

Keyword groups monitored:
- brand: ${KEYWORD_GROUPS.brand.join(', ')}
- zatca: ${KEYWORD_GROUPS.zatca.join(', ')}
- market: ${KEYWORD_GROUPS.market.join(', ')}
- competitors: ${KEYWORD_GROUPS.competitors.join(', ')}

For EACH mention found, classify it:
- sentiment: positive / negative / neutral / question
- urgency: HOT (needs response today) / WARM (worth tracking) / COLD (noise)
- type: complaint / praise / question / news / competitor_move / regulatory_update / opportunity
- qoyod_relevant: true if Qoyod should act on this

Mark as HOT if:
- Direct complaint about Qoyod or a close competitor
- New ZATCA/regulatory announcement
- A potential customer asking for accounting software
- A competitor launching a promotion or new feature
- Viral content (even if neutral) about e-invoicing or Saudi accounting

Return structured JSON with all mentions classified + a plain-Arabic summary paragraph.`,
  { label: 'classify-mentions', schema: MENTION_SCHEMA }
)

if (!classified) {
  log('Classification returned null — no listening data available yet.')
  return { error: 'No listening data' }
}

const hotMentions = (classified.mentions || []).filter(m => m.urgency === 'HOT')
log(`Classified ${classified.mentions?.length || 0} mentions. ${hotMentions.length} HOT.`)

// ── Phase 3: Draft responses for HOT mentions ───────────────────────────────
phase('Respond')

const responseDrafts = hotMentions.length > 0
  ? await parallel(
      hotMentions.slice(0, 5).map((mention, i) => async () => {
        return await agent(
          `You are Qoyod's social media voice — Saudi Arabic dialect, professional but warm, NEVER Egyptian dialect.

MENTION TO RESPOND TO:
Type: ${mention.type}
Text: "${mention.text}"
Keyword group: ${mention.keyword_group}
Source: ${mention.source || 'Twitter/X'}

Write a draft response appropriate for ${mention.type}:
- complaint → empathetic, offer solution path, end with direct contact method
- question → answer directly and clearly, one CTA to trial/demo
- regulatory_update → Qoyod is already compliant, one sentence proof, soft CTA
- competitor_move → do NOT name the competitor, state Qoyod's advantage calmly
- opportunity → warm outreach, mention the specific pain they expressed

Rules:
- Saudi dialect (مو/وش/ليش) — no Egyptian
- Max 60 words
- Zero emojis
- One message, one CTA

Return JSON: { draft_ar, tone, cta, internal_note }`,
          {
            label: `respond-hot-${i}`,
            schema: {
              type: 'object',
              properties: {
                draft_ar: { type: 'string' },
                tone: { type: 'string' },
                cta: { type: 'string' },
                internal_note: { type: 'string' },
              },
              required: ['draft_ar'],
            },
          }
        )
      })
    )
  : []

const validResponses = responseDrafts.filter(Boolean)
log(`Drafted ${validResponses.length} responses for HOT mentions`)

// ── Phase 4: Save digest + notify Slack ─────────────────────────────────────
phase('Save')

const today = args?.date || new Date().toISOString().slice(0, 10)

const digest = `# Social Listening Digest — ${today}

## Summary
${classified.summary}

## Stats
- Total mentions found: ${classified.total_found || classified.mentions?.length || 0}
- HOT (action needed): ${hotMentions.length}
- WARM (monitoring): ${(classified.mentions || []).filter(m => m.urgency === 'WARM').length}

${hotMentions.length > 0 ? `## HOT Mentions — Act Today

${hotMentions.slice(0, 10).map((m, i) => `### ${i + 1}. ${m.type?.toUpperCase()} — ${m.keyword_group}
${m.text?.slice(0, 300)}
${m.url ? `URL: ${m.url}` : ''}

${validResponses[i] ? `**Draft Response:**
${validResponses[i].draft_ar}
CTA: ${validResponses[i].cta || '—'}
Note: ${validResponses[i].internal_note || '—'}` : ''}

---`).join('\n')}` : '## No HOT mentions today — all quiet.\n'}

## All Mentions by Group

${['brand', 'zatca', 'market', 'competitors'].map(group => {
  const groupMentions = (classified.mentions || []).filter(m => m.keyword_group === group)
  if (!groupMentions.length) return `### ${group.toUpperCase()}\nNo mentions.\n`
  return `### ${group.toUpperCase()} (${groupMentions.length})
${groupMentions.slice(0, 5).map(m => `- [${m.urgency}] ${m.sentiment} | ${m.text?.slice(0, 120)}`).join('\n')}
`
}).join('\n')}
`

await agent(
  `Save the following social listening digest to Google Drive as a Google Doc titled "Social Listening — ${today}".

Then, if there are any HOT mentions (urgency === HOT), also post a brief Slack message to the marketing channel summarizing them. Keep the Slack message under 200 words, in Arabic, and list each HOT mention with a one-line description and the draft response.

Document content:
${digest}

HOT mention count: ${hotMentions.length}`,
  { label: 'save-and-notify' }
)

return {
  date: today,
  total_mentions: classified.mentions?.length || 0,
  hot_mentions: hotMentions.length,
  responses_drafted: validResponses.length,
  summary: classified.summary,
}
