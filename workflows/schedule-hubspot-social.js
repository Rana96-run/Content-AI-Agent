export const meta = {
  name: 'schedule-hubspot-social',
  description: 'Schedule one or more social posts in HubSpot Social — Instagram, LinkedIn, Facebook. Pass posts array via args.',
  phases: [
    { title: 'Channels', detail: 'Discover connected HubSpot social channels' },
    { title: 'Schedule', detail: 'Create scheduled broadcasts for each post' },
    { title: 'Confirm', detail: 'Return scheduled post IDs and times' },
  ],
}

// Required env vars on Railway:
//   HUBSPOT_ACCESS_TOKEN  — HubSpot Private App token (Marketing + Social scopes)

// args shape:
// {
//   date: string,   // YYYY-MM-DD
//   posts: [
//     {
//       caption: string,
//       platform: 'instagram' | 'linkedin' | 'facebook',
//       scheduled_time: string,   // ISO 8601 e.g. "2026-06-12T09:00:00+03:00"
//       image_url?: string,
//     }
//   ]
// }

const posts = args?.posts ?? []
const date = args?.date ?? 'today'

if (!posts.length) {
  log('No posts in args.posts — nothing to schedule')
  return { ok: false, error: 'No posts provided' }
}

// ── Phase 1: Discover HubSpot social channels ────────────────────────────────
phase('Channels')

const channels = await agent(
  `Fetch the connected social channels from HubSpot Social API using the Bash tool:

curl -s "https://api.hubapi.com/marketing/v3/social/channels" \\
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \\
  -H "Content-Type: application/json"

(Read $HUBSPOT_ACCESS_TOKEN from the environment)

Parse the JSON response and return an array of channels with their id, type (INSTAGRAM/LINKEDIN/FACEBOOK), and name.
Return JSON: { channels: [{ id: string, type: string, name: string }] }`,
  {
    label: 'fetch-channels',
    schema: {
      type: 'object',
      properties: {
        channels: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, type: { type: 'string' }, name: { type: 'string' } },
            required: ['id', 'type'],
          },
        },
      },
      required: ['channels'],
    },
  }
)

if (!channels?.channels?.length) {
  return { ok: false, error: 'No HubSpot social channels found — connect accounts in HubSpot Settings > Social' }
}

log(`Found ${channels.channels.length} channels: ${channels.channels.map(c => c.type).join(', ')}`)

// ── Phase 2: Schedule each post ──────────────────────────────────────────────
phase('Schedule')

const scheduled = await parallel(
  posts.map((post, i) => async () => {
    const channel = channels.channels.find(
      c => c.type.toLowerCase().includes(post.platform.toLowerCase())
    )
    if (!channel) {
      log(`No ${post.platform} channel found in HubSpot — skipping post ${i + 1}`)
      return null
    }

    return await agent(
      `Schedule this social post in HubSpot using the Bash tool:

POST body:
${JSON.stringify({
  channelId: channel.id,
  scheduledAt: post.scheduled_time,
  content: {
    body: post.caption,
    ...(post.image_url ? { photoUrl: post.image_url } : {}),
  },
}, null, 2)}

Command:
curl -s -X POST "https://api.hubapi.com/marketing/v3/social/channels/${channel.id}/broadcasts" \\
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ scheduledAt: post.scheduled_time, content: { body: post.caption, ...(post.image_url ? { photoUrl: post.image_url } : {}) } })}'

Return JSON: { ok: boolean, broadcast_id: string, platform: "${post.platform}", scheduled_time: "${post.scheduled_time}", error?: string }`,
      {
        label: `schedule-${post.platform}-${i}`,
        schema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            broadcast_id: { type: 'string' },
            platform: { type: 'string' },
            scheduled_time: { type: 'string' },
            error: { type: 'string' },
          },
          required: ['ok'],
        },
      }
    )
  })
)

const successful = scheduled.filter(r => r?.ok)
const failed = scheduled.filter(r => r && !r.ok)

log(`Scheduled ${successful.length}/${posts.length} posts. Failed: ${failed.length}`)

return {
  ok: true,
  date,
  scheduled_count: successful.length,
  failed_count: failed.length,
  broadcasts: successful,
  errors: failed.map(f => f?.error),
}
