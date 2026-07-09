// SiteTracker AI proxy — keeps the Anthropic API key server-side, never in the browser.
// Set ANTHROPIC_API_KEY in Netlify: Site configuration → Environment variables.

const PARSE_SYSTEM = `You are a CRM data extractor for a building-materials sales app in India.
You receive a field visit note written or dictated by a sales executive. The note may be in Telugu, Hindi, English, or a mix (code-switched). You also receive the site's current stage, the list of valid stage keys, valid material category keys, and valid material statuses.

Extract ONLY what the note clearly states. Do not guess. Reply with ONLY a JSON object, no other text:
{
 "stage": "<stage key if the note indicates the construction stage changed, else omit>",
 "materials": [ {"cat":"<material key>", "status":"<open|quoted|won|lost, only if stated>", "brand":"<brand name if a preferred/used brand is mentioned>", "competitor":"<competitor brand if mentioned>"} ],
 "nextFollowUp": "<YYYY-MM-DD if a follow-up time is mentioned (resolve relative dates like 'next week' using the provided today date), else omit>",
 "nextAction": "<short action in English if the note implies one, else omit>",
 "summary": "<one-line English summary of the note>"
}`;

const BRIEF_SYSTEM = `You are a sales coach for a building-materials company in India. You receive today's date, the executive's name, and a JSON list of construction sites that need attention (level hot = active requirement now, warm = upcoming).
Write a short, punchy morning briefing in English (max 120 words): which site to visit first and why, what to carry (samples/rates), which competitor to counter, and one motivating line at the end. Use plain text, no markdown, no bullet symbols other than numbers.`;

export default async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return new Response('ANTHROPIC_API_KEY is not set in Netlify environment variables', { status: 500 });

  let body;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  const { kind, payload } = body || {};

  let system;
  if (kind === 'parse') system = PARSE_SYSTEM;
  else if (kind === 'brief') system = BRIEF_SYSTEM;
  else return new Response('Unknown kind', { status: 400 });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: JSON.stringify(payload) }]
    })
  });
  if (!r.ok) return new Response('AI provider error: ' + (await r.text()).slice(0, 300), { status: 502 });

  const data = await r.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '';

  if (kind === 'parse') {
    const m = text.match(/\{[\s\S]*\}/);
    let out = {};
    try { out = m ? JSON.parse(m[0]) : {}; } catch {}
    return Response.json(out);
  }
  return Response.json({ text: text.trim() });
};
