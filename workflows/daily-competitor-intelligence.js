export const meta = {
  name: 'daily-competitor-intelligence',
  description: 'Scrape competitor posts, extract angles, generate Qoyod counter-content in Saudi dialect',
  phases: [
    { title: 'Capture', detail: 'Trigger Railway competitor Instagram scrape' },
    { title: 'Analyse', detail: 'Extract hooks, angles, weaknesses per competitor' },
    { title: 'Counter-Content', detail: 'Write Qoyod counter-posts in Saudi Arabic' },
    { title: 'Save', detail: 'Save to Drive and notify Slack' },
  ],
}

const RAILWAY = 'https://somaa-ai-agent-production.up.railway.app';
const COMPETITORS = ['Daftra', 'Rewaa', 'Wafeq', 'Smacc', 'Dafater'];

// ── Phase 1: Trigger Railway daily capture ──────────────────────────────────
phase('Capture')

const captureResult = await agent(
  `Use the Bash tool to trigger the daily competitor Instagram capture on our Railway server, then read the results from Google Drive:

1. Trigger the capture:
   curl -s -X POST "${RAILWAY}/api/agent/daily-capture/run-now" -H "Content-Type: application/json"

2. Wait 120 seconds (the scrape takes ~2 minutes):
   sleep 120

3. Use the Google Drive MCP tool to search for the most recent Google Doc named "Daily Competitor Capture" (today's capture is saved there automatically). Read its content and return it as text.

Return the Drive document content. If the Drive doc isn't found yet, return whatever text you can from the trigger response.`,
  { label: 'trigger-capture' }
)

log(`Capture triggered. Response: ${typeof captureResult === 'string' ? captureResult.slice(0, 200) : 'done'}`)

// ── Phase 2: Read the Drive doc and analyse ─────────────────────────────────
phase('Analyse')

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    competitors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          posts_today: { type: 'number' },
          dominant_hook: { type: 'string' },
          funnel_stage: { type: 'string' },
          main_angle: { type: 'string' },
          key_weakness: { type: 'string' },
          sector_targeted: { type: 'string' },
        },
        required: ['name', 'dominant_hook', 'key_weakness'],
      },
    },
    overall_pattern: { type: 'string' },
    qoyod_opportunity: { type: 'string' },
    urgent_threat: { type: 'string' },
  },
  required: ['competitors', 'overall_pattern', 'qoyod_opportunity'],
}

const analysis = await agent(
  `You are a competitive intelligence analyst for Qoyod — Saudi cloud accounting SaaS, ZATCA-certified, 25,000+ customers.

Context from today's competitor capture:
${JSON.stringify(captureResult, null, 2).slice(0, 4000)}

Competitors to analyse: ${COMPETITORS.join(', ')}

Tasks:
1. For each competitor that had activity today, extract: their dominant hook/message, what funnel stage they're targeting (TOF/MOF/BOF), what angle (fear/authority/social_proof/offer/aspiration/comparison), and their key weakness or gap.
2. Identify the overall pattern: what messaging strategy are competitors pushing this week?
3. Identify Qoyod's biggest opportunity this week based on what the competitors are NOT doing or doing poorly.
4. Flag any urgent threat (a competitor running a heavy promotion or copying Qoyod's positioning).

Return structured JSON with your analysis.`,
  { label: 'analyse-competitors', schema: ANALYSIS_SCHEMA }
)

if (!analysis) {
  log('Analysis returned null — competitor data may not be ready yet. Try triggering manually from the dashboard.')
  return { error: 'No analysis data' }
}

log(`Analysed ${analysis.competitors?.length || 0} competitors. Opportunity: ${analysis.qoyod_opportunity?.slice(0, 100)}`)

// ── Phase 3: Generate counter-content in parallel ───────────────────────────
phase('Counter-Content')

const activeCompetitors = (analysis.competitors || []).filter(c => c.dominant_hook)

const counterPosts = await parallel(
  activeCompetitors.slice(0, 4).map(comp => async () => {
    return await agent(
      `You are writing content as Qoyod — Saudi cloud accounting SaaS.

BRAND RULES (non-negotiable):
- Saudi Arabic dialect ONLY: مو (not مش), وش (not ايه), ليش (not ليه), كذا (not كده)
- Zero emojis in output
- ONE message per post, ONE CTA, ONE trust element
- Never over-promise: no "أفضل برنامج", no "100%", no "مضمون"
- Brand keywords to weave in (pick 2): موثوق · معتمد · منظم · واضح · يريح بالك

COMPETITOR INTEL:
- Competitor: ${comp.name}
- Their hook today: "${comp.dominant_hook}"
- Their angle: ${comp.main_angle || 'unknown'}
- Their weakness: "${comp.key_weakness}"
- Sector they targeted: ${comp.sector_targeted || 'general'}

YOUR TASK:
Write ONE Qoyod Instagram caption (80 words max) that:
1. Opens with the exact pain their ad exposed — but from Qoyod's POV
2. Positions Qoyod as the solution to their weakness specifically
3. Ends with one clear CTA

Also write a brief content hypothesis: "If [this hook angle] then [metric] because [reason]"

Return JSON: { hook_ar, body_ar, cta_ar, trust_element, funnel_stage, hypothesis, kill_criterion }`,
      {
        label: `counter-${comp.name}`,
        schema: {
          type: 'object',
          properties: {
            hook_ar: { type: 'string' },
            body_ar: { type: 'string' },
            cta_ar: { type: 'string' },
            trust_element: { type: 'string' },
            funnel_stage: { type: 'string' },
            hypothesis: { type: 'string' },
            kill_criterion: { type: 'string' },
          },
          required: ['hook_ar', 'body_ar', 'cta_ar'],
        },
      }
    )
  })
)

const validPosts = counterPosts.filter(Boolean)
log(`Generated ${validPosts.length} counter-posts`)

// ── Phase 4: Save to Drive ───────────────────────────────────────────────────
phase('Save')

const today = args?.date ?? 'today'

const saveResult = await agent(
  `Save today's competitor intelligence report to Google Drive.

Use the Google Drive MCP tool to create a Google Doc titled "Counter-Content Brief — ${today}".

Content to save:

# Counter-Content Brief — ${today}

## Market Opportunity
${analysis.qoyod_opportunity}

## Overall Competitor Pattern
${analysis.overall_pattern}

${analysis.urgent_threat ? `## ⚠ Urgent Threat\n${analysis.urgent_threat}\n` : ''}

## Counter-Posts Ready to Use

${validPosts.map((p, i) => `### ${activeCompetitors[i]?.name || 'Competitor ' + (i+1)}

**Hook:**
${p?.hook_ar || '—'}

**Body:**
${p?.body_ar || '—'}

**CTA:** ${p?.cta_ar || '—'}
**Trust:** ${p?.trust_element || '—'}
**Funnel:** ${p?.funnel_stage || '—'}
**Hypothesis:** ${p?.hypothesis || '—'}
**Kill criterion:** ${p?.kill_criterion || '—'}

---`).join('\n')}

## Raw Competitor Analysis
${JSON.stringify(analysis.competitors, null, 2)}
`,
  { label: 'save-to-drive' }
)

log(`Saved to Drive: ${saveResult}`)

return {
  date: today,
  competitors_analysed: analysis.competitors?.length,
  counter_posts_generated: validPosts.length,
  opportunity: analysis.qoyod_opportunity,
  posts: validPosts,
}
