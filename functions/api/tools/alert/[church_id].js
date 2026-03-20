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
  try {
    const { church_id } = params;

    let body;
    let smsResult = null;
    try {
      const rawText = await request.text();
      body = JSON.parse(rawText);
    } catch {
      body = {};
    }

    // ElevenLabs may wrap params under a "parameters" key
    const params_data = body.parameters || body;
    const situation = params_data.situation || "No details provided";
    const severity = params_data.severity || "concerning";
    const first_name = params_data.first_name || null;

    // Look up church
    const church = await env.DB.prepare(
      "SELECT name, email, admin_email FROM churches WHERE id = ? AND active = 1"
    )
      .bind(church_id)
      .first();

    if (!church) {
      return json({ error: "Church not found" }, 404);
    }

    const alert_id = crypto.randomUUID();
    const createdAt = Math.floor(Date.now() / 1000);

    // Insert into pastoral_alerts table
    await env.DB.prepare(
      `INSERT INTO pastoral_alerts (id, church_id, user_id, type, message, resolved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(alert_id, church_id, first_name || 'anonymous', severity, situation, 0, createdAt)
      .run();

    const timestampStr = new Date(createdAt * 1000).toUTCString();
    const visitorLabel = first_name ? ` from ${first_name}` : "";

    // Send email via Resend (non-fatal)
    const alertEmail =
      env.PASTORAL_ALERT_EMAIL || church.admin_email || church.email;
    if (alertEmail && env.RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Pastor Dave <onboarding@resend.dev>",
          to: [alertEmail],
          subject: `🚨 Pastoral Alert — ${severity} situation at ${church.name}`,
          html: `
            <p><strong>Pastor Dave has flagged a situation requiring pastoral attention${visitorLabel} at ${church.name}.</strong></p>
            <table style="border-collapse:collapse;width:100%;max-width:600px;">
              <tr><td style="padding:8px;font-weight:bold;width:120px;">Severity</td><td style="padding:8px;">${severity}</td></tr>
              <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Situation</td><td style="padding:8px;">${situation}</td></tr>
              ${first_name ? `<tr><td style="padding:8px;font-weight:bold;">Visitor Name</td><td style="padding:8px;">${first_name}</td></tr>` : ""}
              <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Timestamp</td><td style="padding:8px;">${timestampStr}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Alert ID</td><td style="padding:8px;font-family:monospace;font-size:12px;">${alert_id}</td></tr>
            </table>
            <p style="margin-top:16px;">This alert was generated automatically during a Pastor Dave conversation. Please follow up with the visitor as soon as possible.</p>
            <p style="color:#888;font-size:12px;">Pastor Dave Pro — ${church.name}</p>
          `,
        }),
      }).catch(() => {
        // Email failure is non-fatal
      });
    }

    // Send SMS via Twilio (non-fatal)
    if (
      env.TWILIO_ACCOUNT_SID &&
      env.TWILIO_AUTH_TOKEN &&
      env.TWILIO_FROM_NUMBER &&
      env.PASTORAL_ALERT_PHONE
    ) {
      const truncatedSituation =
        situation.length > 100 ? situation.slice(0, 97) + "..." : situation;
      const smsBody = `Pastor Dave Alert at ${church.name}: ${severity} — ${truncatedSituation}. Check email for details.`;

      const twilioResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization:
              "Basic " +
              btoa(
                `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`
              ),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: env.TWILIO_FROM_NUMBER,
            To: env.PASTORAL_ALERT_PHONE,
            Body: smsBody,
          }).toString(),
        }
      );
      const twilioData = await twilioResp.json().catch(() => ({}));
      smsResult = { status: twilioResp.status, sid: twilioData.sid, error: twilioData.message };
    }

    return json({
      success: true,
      alert_id,
      sms: smsResult,
      message: "I've notified the pastoral team. You are not alone, and help is on the way.",
    });
  } catch (err) {
    return json(
      { error: "Internal error", detail: err.message || String(err) },
      500
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}
