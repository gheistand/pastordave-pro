import { requireAdmin, json } from './_admin_auth.js';

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  try {
    const [visitors, alertsOpen, alertsResolved, sermons, usersPro, usersChurch] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as n FROM visitors WHERE church_id = ?').bind(admin.churchId).first(),
      env.DB.prepare('SELECT COUNT(*) as n FROM pastoral_alerts WHERE church_id = ? AND resolved = 0').bind(admin.churchId).first(),
      env.DB.prepare('SELECT COUNT(*) as n FROM pastoral_alerts WHERE church_id = ? AND resolved = 1').bind(admin.churchId).first(),
      env.DB.prepare('SELECT COUNT(*) as n FROM sermons WHERE church_id = ?').bind(admin.churchId).first(),
      env.DB.prepare("SELECT COUNT(*) as n FROM users WHERE tier = 'pro'").first(),
      env.DB.prepare("SELECT COUNT(*) as n FROM users WHERE tier = 'church'").first(),
    ]);

    return json({
      visitors: visitors?.n ?? 0,
      alerts_open: alertsOpen?.n ?? 0,
      alerts_resolved: alertsResolved?.n ?? 0,
      sermons: sermons?.n ?? 0,
      users_pro: usersPro?.n ?? 0,
      users_church: usersChurch?.n ?? 0,
    });
  } catch (err) {
    return json({ error: 'DB error', detail: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
