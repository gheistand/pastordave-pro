const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export async function onRequestPost({ params, env, request }) {
  const { church_id } = params;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { name, email, phone, interest } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return json({ error: "name is required" }, 400);
  }

  // Look up church to get notification contact
  const church = await env.DB.prepare(
    "SELECT name, email, admin_email, connect_card_contact FROM churches WHERE id = ? AND active = 1"
  )
    .bind(church_id)
    .first();

  if (!church) {
    return json({ error: "Church not found" }, 404);
  }

  // Insert visitor record
  const visitorId = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO visitors (id, church_id, name, email, phone, interest, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      visitorId,
      church_id,
      name.trim(),
      email || null,
      phone || null,
      interest || null,
      createdAt
    )
    .run();

  // Send email notification if we have a contact and API key
  const notifyEmail = church.admin_email || church.email;
  if (notifyEmail && env.RESEND_API_KEY) {
    const lines = [
      `<strong>Name:</strong> ${name.trim()}`,
      email ? `<strong>Email:</strong> ${email}` : null,
      phone ? `<strong>Phone:</strong> ${phone}` : null,
      interest ? `<strong>Interest:</strong> ${interest}` : null,
    ].filter(Boolean);

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Pastor Dave <onboarding@resend.dev>",
        to: [notifyEmail],
        subject: `New visitor: ${name.trim()} — ${church.name}`,
        html: `
          <p>Pastor Dave captured a new visitor during a conversation at <strong>${church.name}</strong>.</p>
          <ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
          <p style="color:#888;font-size:12px;">Captured ${new Date(createdAt * 1000).toUTCString()}</p>
        `,
      }),
    }).catch(() => {
      // Email failure is non-fatal — visitor record is already saved
    });
  }

  return json({ success: true, id: visitorId });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}
