// Pastor Dave Pro — Bulletin Cron Worker
// Runs every Monday at 10 AM UTC
// Fetches each church's bulletin_url, strips HTML, stores in weekly_bulletin

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshAllBulletins(env));
  },

  // Manual trigger via HTTP GET /run for testing
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/run') {
      const results = await refreshAllBulletins(env);
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Pastor Dave Bulletin Cron — GET /run to trigger manually', { status: 200 });
  },
};

async function refreshAllBulletins(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, bulletin_url FROM churches WHERE bulletin_url IS NOT NULL AND bulletin_url != ''"
  ).all();

  const log = [];

  for (const church of results) {
    try {
      const text = await fetchBulletinText(church.bulletin_url);
      if (text && text.length > 50) {
        await env.DB.prepare(
          'UPDATE churches SET weekly_bulletin = ? WHERE id = ?'
        ).bind(text, church.id).run();
        log.push({ church: church.name, status: 'updated', chars: text.length });
        console.log(`Updated bulletin for ${church.name} (${text.length} chars)`);
      } else {
        log.push({ church: church.name, status: 'skipped', reason: 'content too short' });
      }
    } catch (err) {
      log.push({ church: church.name, status: 'error', error: err.message });
      console.error(`Failed to fetch bulletin for ${church.name}: ${err.message}`);
    }
  }

  return log;
}

async function fetchBulletinText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PastorDaveBot/1.0 (bulletin-refresh)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#[0-9]+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 4000);
}
