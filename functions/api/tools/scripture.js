// Pastor Dave Pro — Scripture Lookup Tool
// Called by ElevenLabs agent to fetch exact Bible text from API.Bible
// NEVER let the LLM generate Scripture text directly — always use this tool

const BIBLE_API_BASE = 'https://rest.api.bible/v1';

// Translation ID map — add more as needed
const TRANSLATION_IDS = {
  'NLT':  'd6e14a625393b4da-01',
  'NIV':  '78a9f6124f344018-01',
  'KJV':  '55212e3cf5d04d49-01',
  'ESV':  null, // ESV requires separate API key — omit for now
  'NASB': null,
};

const DEFAULT_TRANSLATION = 'NLT';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  // Support both query params (direct call) and ElevenLabs param wrapping
  const reference = url.searchParams.get('reference') || url.searchParams.get('verse');
  const churchId = url.searchParams.get('church_id') || 'new-horizon-champaign';
  let translation = url.searchParams.get('translation');

  if (!reference) {
    return json({ error: 'reference parameter required (e.g. John 3:16 or Romans 8:28-30)' }, 400);
  }

  if (!env.BIBLE_API_KEY) {
    return json({ error: 'BIBLE_API_KEY not configured' }, 500);
  }

  // If no translation specified, look up church's preferred translation from D1
  if (!translation) {
    try {
      const church = await env.DB.prepare(
        'SELECT bible_translation FROM churches WHERE id = ?'
      ).bind(churchId).first();
      translation = church?.bible_translation || DEFAULT_TRANSLATION;
    } catch {
      translation = DEFAULT_TRANSLATION;
    }
  }

  translation = translation.toUpperCase();
  const bibleId = TRANSLATION_IDS[translation];

  if (!bibleId) {
    return json({
      error: `Translation "${translation}" not supported. Available: ${Object.keys(TRANSLATION_IDS).filter(k => TRANSLATION_IDS[k]).join(', ')}`,
    }, 400);
  }

  // Convert human-readable reference to API.Bible passage ID format
  // e.g. "John 3:16" → search via /search or use /passages
  try {
    // Use the passages endpoint with search query — most flexible approach
    const searchUrl = `${BIBLE_API_BASE}/bibles/${bibleId}/search?query=${encodeURIComponent(reference)}&limit=1`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'api-key': env.BIBLE_API_KEY },
    });

    if (!searchRes.ok) throw new Error(`API.Bible search error: ${searchRes.status}`);
    const searchData = await searchRes.json();

    // Try passages first (more reliable for references)
    const passages = searchData?.data?.passages;
    const verses = searchData?.data?.verses;

    let scriptureText = '';
    let foundReference = reference;

    if (passages && passages.length > 0) {
      scriptureText = passages[0].content
        .replace(/<[^>]+>/g, '') // strip any HTML
        .replace(/\s+/g, ' ')
        .trim();
      foundReference = passages[0].reference || reference;
    } else if (verses && verses.length > 0) {
      scriptureText = verses.map(v =>
        v.text.replace(/<[^>]+>/g, '').trim()
      ).join(' ');
      foundReference = verses[0].reference || reference;
    } else {
      return json({
        reference,
        translation,
        found: false,
        message: `Could not find "${reference}" in the ${translation}. Please check the reference and try again.`,
      });
    }

    return json({
      reference: foundReference,
      translation,
      text: scriptureText,
      found: true,
      instruction: `Quote this text EXACTLY as provided. Do not paraphrase or alter the wording. Attribution: ${foundReference} (${translation})`,
    });

  } catch (err) {
    return json({ error: 'Failed to fetch scripture', detail: err.message }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
