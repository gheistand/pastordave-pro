// POST /api/discipleship-group/generate-guide
// Calls Claude to generate a Head/Heart/Hands discussion guide
import { requireChurch, json } from './_dg_auth.js';

function buildPrompt({ group_profile, sermon, readings, week_theme, meeting_length }) {
  const groupName = group_profile?.group_name || 'Small Group';
  const leaderName = group_profile?.leader_name || 'Leader';
  const groupDesc = group_profile?.group_description || '';
  const meetingLen = meeting_length || group_profile?.default_meeting_length || 75;

  const sermonTitle = sermon?.title || '(no sermon this week)';
  const sermonScripture = sermon?.scripture || '';
  const sermonSummary = sermon?.summary || '';
  const sermonKeyPoints = Array.isArray(sermon?.key_points) ? sermon.key_points.join('\n- ') : '';

  const readingsList = Array.isArray(readings) && readings.length > 0
    ? readings.map(r => {
        const parts = [];
        if (r.old_testament) parts.push(`OT: ${r.old_testament}`);
        if (r.new_testament) parts.push(`NT: ${r.new_testament}`);
        if (r.psalm) parts.push(`Psalm: ${r.psalm}`);
        if (r.proverbs) parts.push(`Prov: ${r.proverbs}`);
        return `${String(r.month).padStart(2,'0')}/${String(r.day).padStart(2,'0')}: ${parts.join(' | ')}`;
      }).join('\n')
    : '(no readings this week)';

  return `You are helping a small group Bible study leader prepare a discussion guide.

GROUP CONTEXT:
- Group: ${groupName}
- Leader: ${leaderName}
- Meeting Length: ${meetingLen} minutes
${groupDesc ? `- Description: ${groupDesc}` : ''}

THIS WEEK'S SERMON:
- Title: ${sermonTitle}
${sermonScripture ? `- Scripture: ${sermonScripture}` : ''}
${sermonSummary ? `- Summary: ${sermonSummary}` : ''}
${sermonKeyPoints ? `- Key Points:\n  - ${sermonKeyPoints}` : ''}

THIS WEEK'S BIBLE READINGS (One Year Bible):
${readingsList}

${week_theme ? `WEEK THEME: ${week_theme}` : ''}

Create a discussion guide using the Head/Heart/Hands (HHH) framework:
- HEAD: Questions helping the group understand what the text MEANS (theological, contextual, historical)
- HEART: Questions connecting the text to EMOTIONS, personal experience, inner transformation
- HANDS: Questions leading to PRACTICAL ACTION — what the group will DO differently this week

Include:
1. A key verse reference (book chapter:verse) — note only the reference; it will be verified via Bible API
2. A brief opening prayer prompt (2-3 sentences suggesting what to pray for)
3. HEAD section: guiding question + 3 discussion questions
4. HEART section: guiding question + 3 discussion questions
5. HANDS section: guiding question + 3 discussion questions
6. A brief closing prayer prompt (2-3 sentences)

IMPORTANT: Return ONLY valid JSON, no markdown, no extra text. Use this exact format:
{
  "key_verse": "Book Chapter:Verse",
  "opening_prayer_prompt": "...",
  "sections": [
    {
      "type": "HEAD",
      "title": "Head — Understanding the Word",
      "guiding_question": "What does God want us to KNOW from this passage?",
      "questions": ["...", "...", "..."]
    },
    {
      "type": "HEART",
      "title": "Heart — Feeling the Word",
      "guiding_question": "What does God want us to FEEL through this passage?",
      "questions": ["...", "...", "..."]
    },
    {
      "type": "HANDS",
      "title": "Hands — Living the Word",
      "guiding_question": "What does God want us to DO because of this passage?",
      "questions": ["...", "...", "..."]
    }
  ],
  "closing_prayer_prompt": "..."
}`;
}

function buildMarkdown(guideJson, sermon, readings, weekTheme) {
  const g = guideJson;
  const lines = [];

  lines.push(`# Discussion Guide`);
  if (sermon?.title) lines.push(`## ${sermon.title}`);
  if (sermon?.date) lines.push(`*${sermon.date}*`);
  if (weekTheme) lines.push(`\n**Theme:** ${weekTheme}`);
  lines.push('');

  if (g.key_verse) {
    lines.push(`### Key Verse`);
    lines.push(`📖 ${g.key_verse}`);
    lines.push('');
  }

  if (g.opening_prayer_prompt) {
    lines.push(`### Opening Prayer`);
    lines.push(g.opening_prayer_prompt);
    lines.push('');
  }

  if (Array.isArray(readings) && readings.length > 0) {
    lines.push(`### This Week's Readings`);
    readings.forEach(r => {
      const parts = [];
      if (r.old_testament) parts.push(r.old_testament);
      if (r.new_testament) parts.push(r.new_testament);
      if (r.psalm) parts.push(r.psalm);
      if (r.proverbs) parts.push(r.proverbs);
      lines.push(`- ${parts.join(' · ')}`);
    });
    lines.push('');
  }

  for (const section of (g.sections || [])) {
    const emoji = section.type === 'HEAD' ? '🧠' : section.type === 'HEART' ? '❤️' : '🙌';
    lines.push(`---`);
    lines.push(`### ${emoji} ${section.title}`);
    if (section.guiding_question) {
      lines.push(`*${section.guiding_question}*`);
    }
    lines.push('');
    (section.questions || []).forEach((q, i) => {
      lines.push(`${i + 1}. ${q}`);
    });
    lines.push('');
  }

  if (g.closing_prayer_prompt) {
    lines.push(`---`);
    lines.push(`### Closing Prayer`);
    lines.push(g.closing_prayer_prompt);
    lines.push('');
  }

  return lines.join('\n');
}

export async function onRequestPost({ request, env }) {
  const auth = await requireChurch(request, env);
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'AI generation not configured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const prompt = buildPrompt(body);

  let aiRes;
  try {
    aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    return json({ error: 'Failed to call AI: ' + err.message }, 502);
  }

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    return json({ error: 'AI API error', detail: errText }, 502);
  }

  const aiData = await aiRes.json();
  const rawContent = aiData.content?.[0]?.text || '';

  // Extract JSON from response (strip any markdown code fences if present)
  let guideJson;
  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    guideJson = JSON.parse(jsonMatch[0]);
  } catch (err) {
    return json({ error: 'Failed to parse AI response', detail: rawContent }, 502);
  }

  const guideMarkdown = buildMarkdown(guideJson, body.sermon, body.readings, body.week_theme);

  return json({ guide_json: guideJson, guide_markdown: guideMarkdown });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}
