export const meta = {
  name: 'publish-instagram',
  description: 'Publish a single post directly to the connected Instagram Business account via Graph API. Pass content via args.',
  phases: [
    { title: 'Validate', detail: 'Check content and credentials' },
    { title: 'Upload', detail: 'Create Instagram media container' },
    { title: 'Publish', detail: 'Publish the container to the feed' },
    { title: 'Confirm', detail: 'Return post URL and log to Drive' },
  ],
}

// Required env vars on Railway:
//   INSTAGRAM_ACCOUNT_ID  — Instagram Business Account numeric ID
//   META_ACCESS_TOKEN     — Long-lived Page access token (never expires if refreshed)
//   FACEBOOK_PAGE_ID      — Facebook Page linked to the Instagram account

// args shape:
// {
//   caption: string,        // full Arabic caption with CTA
//   image_url: string,      // publicly accessible image URL (https://)
//   date: string,           // YYYY-MM-DD for logging
//   competitor?: string,    // optional — which competitor this counters
// }

const caption = args?.caption ?? ''
const imageUrl = args?.image_url ?? ''
const date = args?.date ?? 'today'

if (!caption || !imageUrl) {
  log('ERROR: args.caption and args.image_url are required')
  return { ok: false, error: 'Missing caption or image_url in args' }
}

// ── Phase 1: Validate ────────────────────────────────────────────────────────
phase('Validate')

const validation = await agent(
  `Validate this Instagram post before publishing:

Caption: "${caption}"

Check ALL of these — return JSON with pass/fail for each:
1. saudi_dialect: does it use Saudi Arabic (مو/وش/ليش)? No Egyptian (مش/ايه/كده)?
2. no_emojis: completely free of emojis?
3. one_message: single clear message (not two ideas)?
4. one_cta: exactly one call to action?
5. length_ok: caption under 2,200 characters?
6. no_overpromise: no "أفضل", "100%", "مضمون", "الأفضل في العالم"?

Also determine: funnel_stage (TOF/MOF/BOF), hook_type (fear/simplicity/control/trust/time)

Return: { pass: boolean, checks: {...}, funnel_stage, hook_type, issues: string[] }`,
  {
    label: 'validate-content',
    schema: {
      type: 'object',
      properties: {
        pass: { type: 'boolean' },
        checks: { type: 'object' },
        funnel_stage: { type: 'string' },
        hook_type: { type: 'string' },
        issues: { type: 'array', items: { type: 'string' } },
      },
      required: ['pass', 'checks'],
    },
  }
)

if (!validation?.pass) {
  log(`Validation FAILED: ${validation?.issues?.join(', ')}`)
  return { ok: false, error: 'Content failed brand validation', issues: validation?.issues }
}

log(`Validation passed — ${validation.funnel_stage} | ${validation.hook_type}`)

// ── Phase 2 & 3: Upload + Publish via Graph API ──────────────────────────────
phase('Upload')

const publishResult = await agent(
  `Publish this post to the Instagram Business account using the Instagram Graph API via curl.

Step 1 — Create media container:
curl -s -X POST "https://graph.facebook.com/v19.0/$INSTAGRAM_ACCOUNT_ID/media" \\
  -d "image_url=${imageUrl}" \\
  -d "caption=${caption.replace(/"/g, '\\"')}" \\
  -d "access_token=$META_ACCESS_TOKEN"

(Replace $INSTAGRAM_ACCOUNT_ID and $META_ACCESS_TOKEN with the actual env var VALUES from the Railway environment — read them with: echo $INSTAGRAM_ACCOUNT_ID and echo $META_ACCESS_TOKEN)

Step 2 — Extract the creation_id from Step 1's JSON response.

Step 3 — Publish the container:
curl -s -X POST "https://graph.facebook.com/v19.0/$INSTAGRAM_ACCOUNT_ID/media_publish" \\
  -d "creation_id=<creation_id from step 2>" \\
  -d "access_token=$META_ACCESS_TOKEN"

Step 4 — From Step 3's response, extract the post id.
Build the post URL: https://www.instagram.com/p/<post_id>/

Return JSON: { ok: boolean, post_id: string, post_url: string, error?: string }`,
  {
    label: 'publish-to-instagram',
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        post_id: { type: 'string' },
        post_url: { type: 'string' },
        error: { type: 'string' },
      },
      required: ['ok'],
    },
  }
)

if (!publishResult?.ok) {
  log(`Publish FAILED: ${publishResult?.error}`)
  return { ok: false, error: publishResult?.error }
}

log(`Published: ${publishResult.post_url}`)

// ── Phase 4: Log to Drive ────────────────────────────────────────────────────
phase('Confirm')

await agent(
  `Log this published Instagram post to Google Drive.

Append to the Google Doc "Instagram Publish Log" (create it if it doesn't exist):

---
Date: ${date}
Post URL: ${publishResult.post_url}
Funnel Stage: ${validation?.funnel_stage ?? '—'}
Hook Type: ${validation?.hook_type ?? '—'}
Caption (first 100 chars): ${caption.slice(0, 100)}...
Competitor countered: ${args?.competitor ?? 'n/a'}
---
`,
  { label: 'log-to-drive' }
)

return {
  ok: true,
  post_url: publishResult.post_url,
  post_id: publishResult.post_id,
  funnel_stage: validation?.funnel_stage,
  hook_type: validation?.hook_type,
}
