/* Image analysis through Gemini or Mistral.
 *
 * POST one picture as multipart form data (`file`), and optionally `provider` ("gemini" or
 * "mistral"; VISION_PROVIDER decides when it is left out); get five scores back. The keys live in
 * GEMINI_API_KEY and MISTRAL_API_KEY in .env.local, server-side only, so they never reach the
 * browser — the same arrangement as the Sekata proxy. Nothing is stored: the picture goes to the
 * provider for the one request and the answer goes back to the page. Both providers get the same
 * prompt and the same schema, and their answers go through the same scoring rules below, so the
 * two can be compared on the same pictures. */

import { FIF_CONTEXT } from '@/lib/fifContext';

type Provider = 'gemini' | 'mistral';
const PROVIDERS: Provider[] = ['gemini', 'mistral'];
const DEFAULT_PROVIDER: Provider = process.env.VISION_PROVIDER === 'mistral' ? 'mistral' : 'gemini';
const PROVIDER_NAME: Record<Provider, string> = { gemini: 'Gemini', mistral: 'Mistral' };

const GEMINI_KEY = process.env.GEMINI_API_KEY;
/* The newest model is asked first because it reads small print and judges intent better; the
 * older one stands behind it because the newest is also the one most often answering "overloaded". */
const GEMINI_MODELS = [...new Set([process.env.GEMINI_MODEL || 'gemini-3.8-flash', process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash'])];
const geminiEndpoint = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

const MISTRAL_KEY = process.env.MISTRAL_API_KEY;
/* Medium reads images and answers to a schema at a fraction of Large's cost; Large stands behind it. */
const MISTRAL_MODELS = [...new Set([process.env.MISTRAL_MODEL || 'mistral-medium-latest', process.env.MISTRAL_FALLBACK_MODEL || 'mistral-large-latest'])];
const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';

/** How long one attempt may take before the next model is tried. */
const ATTEMPT_MS = 75_000;
/** Answers that mean "busy, try again or try the other model". */
const BUSY = [429, 500, 502, 503];

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

export const maxDuration = 60;

const CHECKS = ['ai_generated', 'tampered', 'indecent', 'misleading', 'spam'] as const;

/* The forensic paragraph is the wording supplied for this feature. Around it sit the company
 * facts from lib/fifContext.ts, which is what lets the misleading check tell an ordinary FIF
 * promotion from an imitation of one, and the definitions that pin the answer to a schema. */
const PROMPT = `You are reviewing one image for FIF (FIFGROUP), an Indonesian financing company. The image may be a screenshot of a social media post, a flyer, an advertisement, a chat or a document that carries the FIF name. Text in the image is usually Bahasa Indonesia.

Everything you know about what is official comes from the reference below. Treat it as the truth about FIF and do not assume anything about the company beyond it.

<fif_reference>
${FIF_CONTEXT}
</fif_reference>

Please perform a detailed visual forensic and tampering analysis on this image. Specifically, inspect whether any text or numeric values (such as phone numbers, account details, or contact information) have been digitally altered, replaced, or edited. Check for anomalies such as font mismatches, pixel inconsistency, compression artifacts, irregular blur, perspective misalignment, or lighting disparities around the suspect area.

Then judge the image on five separate checks. Each check gets a score from 0 to 100 for how likely it is true, and one or two plain sentences naming the visible evidence. Judge each check on its own; one being true does not make another true.

1. ai_generated — the picture was produced or substantially altered by an image generator. Look for warped or nonsensical lettering, malformed hands, faces or logos, over-smooth skin and surfaces, repeating textures, impossible geometry, inconsistent shadows and reflections. A real photo, a normal screenshot or ordinary graphic design scores low. If the evidence is weak, say so and keep the score near the middle rather than guessing high.
2. tampered — an existing image was edited after the fact: text or numbers replaced, a phone number, account number or contact detail pasted over, a logo inserted. Use the forensic inspection above. List each suspect region in suspect_areas with what looks wrong there.
3. indecent — nudity, sexual content or otherwise improper imagery that should not appear on a brand account.
4. misleading — the content would lead a reader to lose money or data, or to believe something untrue. Be exhaustive: this check must not miss a single item. There are two grounds for a conflict, and you must say which one applies:
   - The image presents itself as FIF (its name, logo, products or staff) and something in it goes against the reference above. Say which FIF practice it breaks.
   - The image does not claim to be FIF, but carries a trap in its own right: guaranteed or instant approval, "tanpa survey" or "tanpa BI checking", interest quoted per day, an up-front fee, payment to a private account, a request for OTP, PIN or ID photos, a prize that needs a payment, a price far below market with payment before viewing, fake urgency, a look-alike or throwaway domain. Say what the trap is in plain words. Do NOT describe it as "not a FIF product" or "not an official FIF channel": an image that never mentions FIF is not judged against FIF's channels.
   a. Go through the image line by line and fill items_checked with EVERY one of the following that appears, with none left out: every phone or WhatsApp number, every bank or e-wallet account number, every link or domain, every account name or handle, and every separate claim, offer, condition or instruction in the text. One entry per item, in reading order. Read the small print, watermarks, stickers and text inside screenshots too.
   b. For each entry give: kind ("phone", "account", "link", "handle" or "text"), value (copied exactly as written), status, and note (a few words of your own on why). status is "conflict" when the item goes against the reference or is a trap in its own right, "ok" when it is harmless or matches the reference, and "unverifiable" when it cannot be settled.
      The next four rules apply when the image presents itself as FIF. When it does not, a contact detail is "conflict" only if it is the way into a trap named above, and otherwise "unverifiable".
      - A phone number is "ok" only if it is an official channel in the reference. A mobile number (08xx / +62 8xx) presented as FIF customer service, admin, head office, collection or settlement is "conflict". A mobile number of a named branch marketing officer inviting new applications is "unverifiable".
      - An account number is "conflict" when it is in a private person's name or has no company name beside it.
      - A link is "ok" only on fifgroup.co.id or the official app stores; shortened links, other domains and APK files are "conflict".
      - A handle or account name is "conflict" when it imitates FIF without being an official channel in the reference.
      - A text entry is "conflict" when it states something the reference says FIF does not do, or matches a known abuse pattern.
   c. Copy every "conflict" entry into signals as one short sentence each: quote the wording from the image, then say in a few words of your own which FIF practice it breaks, without copying the reference text. Put what is "unverifiable" into needs_checking.
   Scoring is strict: ONE conflict is enough. If signals holds at least one entry the score must be 70 or higher, and 85–100 when the image imitates FIF and asks for money, credentials or personal data. Only when there is no conflict at all may the score be below 60: 0–20 when everything is consistent with how FIF operates, 21–59 when something is unverifiable but nothing conflicts. An ordinary promotion, a low down payment, a cashback, a customer complaint or a review is not a conflict. An image with no offer, no request and no contact details in it — a photo, a chart, a plain document — has nothing to conflict with; score it low and say so.
5. spam — unsolicited promotional material that does not come from FIF's own official channels. Judge what the image IS, not how polished it looks: a neat, professional brochure is still spam when it is an advertisement of this kind.
   The image is spam when it is any of the following. Put each one that applies into spam.signals as one short sentence quoting the wording that shows it, and set spam.category to the best fit:
   - "loan_offer": an advertisement, brochure or flyer offering loans or cash from anyone other than FIF's official channels — pinjaman online (pinjol), dana tunai, KTA, gadai BPKB, "dana cepat cair", takeover or refinancing offers, loan brokers and agents. This is spam whether or not it mentions FIF, and whether or not the lender might be legitimate.
   - "gambling": online gambling, slots, betting, togel.
   - "engagement_services": followers, likes, views, account or review selling.
   - "giveaway_or_prize": giveaways, prize draws, "bagi-bagi saldo", free-gift lures.
   - "job_lure": work-from-home, like-and-subscribe, daily-pay or recruitment lures.
   - "investment_or_mlm": investment schemes, crypto, trading signals, MLM recruitment, arisan.
   - "contact_lure": content whose point is to move the reader elsewhere — "hubungi WA", "DM untuk info", "cek bio", "klik link", a Telegram or WhatsApp group invitation.
   - "other_promotion": any other third-party advertising of goods or services unrelated to a FIF product.
   Typical marks, each of which is a signal on its own: a call to contact a mobile number, WhatsApp or Telegram to apply; claims such as "cepat cair", "tanpa jaminan", "tanpa survey", "bunga rendah", "proses 5 menit", "syarat hanya KTP"; a list of loan amounts and instalments from an unnamed or non-FIF lender; shortened links; hashtag stuffing; the same contact repeated across the image.
   NOT spam, category "none": material from FIF's official channels as listed in the reference (official promotions, branch flyers for FIF products that carry official contact details), a customer's complaint or review, a screenshot of a conversation or a document, a personal photo, a news article.
   Scoring is strict: ONE signal is enough. If spam.signals holds at least one entry the score must be 70 or higher, and 85–100 for a plain advertisement of one of the kinds above. Only with no signal at all may the score be below 60.

Also return extracted_text with the readable text in the image, copied as written, and a summary of two sentences at most in English.

Quote numbers exactly as they appear; they are masked after you answer.`;

const verdict = {
  type: 'OBJECT',
  properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } },
  required: ['score', 'reason'],
};

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    ai_generated: verdict,
    tampered: {
      type: 'OBJECT',
      properties: {
        score: { type: 'INTEGER' },
        reason: { type: 'STRING' },
        suspect_areas: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['score', 'reason', 'suspect_areas'],
    },
    indecent: verdict,
    misleading: {
      type: 'OBJECT',
      properties: {
        score: { type: 'INTEGER' },
        reason: { type: 'STRING' },
        signals: { type: 'ARRAY', items: { type: 'STRING' } },
        needs_checking: { type: 'ARRAY', items: { type: 'STRING' } },
        items_checked: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              kind: { type: 'STRING', enum: ['phone', 'account', 'link', 'handle', 'text'] },
              value: { type: 'STRING' },
              status: { type: 'STRING', enum: ['conflict', 'ok', 'unverifiable'] },
              note: { type: 'STRING' },
            },
            required: ['kind', 'value', 'status', 'note'],
          },
        },
      },
      required: ['score', 'reason', 'signals', 'needs_checking', 'items_checked'],
    },
    spam: {
      type: 'OBJECT',
      properties: {
        score: { type: 'INTEGER' },
        reason: { type: 'STRING' },
        category: { type: 'STRING', enum: ['none', 'loan_offer', 'gambling', 'engagement_services', 'giveaway_or_prize', 'job_lure', 'investment_or_mlm', 'contact_lure', 'other_promotion'] },
        signals: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['score', 'reason', 'category', 'signals'],
    },
    extracted_text: { type: 'STRING' },
    summary: { type: 'STRING' },
  },
  required: [...CHECKS, 'extracted_text', 'summary'],
};

/* Everything is let through, so the model judges an improper picture instead of refusing to look at it. */
const SAFETY = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
  .map((category) => ({ category, threshold: 'BLOCK_NONE' }));

const fail = (status: number, error: string) => Response.json({ error }, { status });
const clamp = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
/* Phone, account and ID numbers are masked here rather than left to the model, which was asked to
 * and got it backwards. Any run of eight or more digits, separators allowed, keeps its last three. */
const mask = (text: string) => text.replace(/\+?\d(?:[\s.\-]?[\d*]){7,}/g, (run) => {
  /* A rupiah amount written with thousands separators is not personal data. */
  if (/^\d{1,3}(\.\d{3})+$/.test(run)) return run;
  const digits = run.replace(/[^\d*]/g, '');
  return '*'.repeat(digits.length - 3) + digits.slice(-3).replace(/\*/g, '•');
});
const str = (v: unknown) => (typeof v === 'string' ? mask(v) : '');

/** One conflict, or one spam signal, is enough to flag the image, whatever score the model put beside it. */
const FLAG_FLOOR = 70;
const KINDS = ['phone', 'account', 'link', 'handle', 'text'];
const STATUSES = ['conflict', 'ok', 'unverifiable'];

function items(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw) => {
    const it = raw as { kind?: unknown; value?: unknown; status?: unknown; note?: unknown };
    if (typeof it?.value !== 'string' || !it.value.trim()) return [];
    return [{
      kind: KINDS.includes(it.kind as string) ? (it.kind as string) : 'text',
      value: mask(it.value),
      status: STATUSES.includes(it.status as string) ? (it.status as string) : 'unverifiable',
      note: str(it.note),
    }];
  });
}
const list = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(mask) : []);

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

/** What a provider hands back: the model that answered and its text, or a response to send as is. */
type Answer = { model: string; text: string; blocked?: string } | { failed: Response };

/** Tries each model twice. A connection that fails to open, a model that answers "busy" and an
 *  attempt that runs out of time all move on to the next try. */
async function attempt(models: string[], send: (model: string) => Promise<Response>) {
  let res: Response | undefined, last: unknown, model = models[0];
  attempts: for (const m of models) {
    for (let i = 0; i < 2; i++) {
      if (i) await new Promise((r) => setTimeout(r, 2000));
      try {
        res = await send(m);
        model = m;
        if (!BUSY.includes(res.status)) break attempts;
        /* Out of quota is not going to change in two seconds; go straight to the other model. */
        if (res.status === 429) break;
      } catch (e) { last = e; }
    }
  }
  return { res, last, model };
}

function unreachable(name: string, models: string[], last: unknown) {
  const cause = (last as { cause?: { code?: string; message?: string } }).cause;
  const why = cause?.code ?? cause?.message ?? (last instanceof Error ? last.message : String(last));
  return fail(502, `${name} could not be reached (${why}), after trying ${models.join(' and ')} twice each. Check the internet or VPN connection of the machine running the dashboard and try again.`);
}

async function askGemini(mimeType: string, data: string): Promise<Answer> {
  if (!GEMINI_KEY) return { failed: fail(503, 'GEMINI_API_KEY is not set. Add it to frontend/.env.local and restart the dev server.') };
  const { res, last, model } = await attempt(GEMINI_MODELS, (m) => fetch(geminiEndpoint(m), {
    method: 'POST',
    signal: AbortSignal.timeout(ATTEMPT_MS),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
      safetySettings: SAFETY,
    }),
  }));
  if (!res) return { failed: unreachable('Gemini', GEMINI_MODELS, last) };
  const body = (await res.json().catch(() => null)) as GeminiResponse | null;
  if (!res.ok) return { failed: fail(502, `Gemini answered ${res.status}${BUSY.includes(res.status) ? ` on every attempt (${GEMINI_MODELS.join(', ')})` : ''}: ${body?.error?.message ?? 'no detail given'}`) };
  const candidate = body?.candidates?.[0];
  const blocked = body?.promptFeedback?.blockReason ?? (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'IMAGE_SAFETY'].includes(candidate?.finishReason ?? '') ? candidate?.finishReason : undefined);
  return { model, blocked, text: candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '' };
}

/** The Gemini schema in standard JSON Schema: lower-case types, and closed objects so a strict answer keeps to it. */
function jsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(jsonSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) out[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : jsonSchema(v);
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

interface MistralResponse {
  choices?: { finish_reason?: string; message?: { content?: string | { type?: string; text?: string }[] } }[];
  message?: string;
  detail?: unknown;
}

async function askMistral(mimeType: string, data: string): Promise<Answer> {
  if (!MISTRAL_KEY) return { failed: fail(503, 'MISTRAL_API_KEY is not set. Add it to frontend/.env.local and restart the dev server.') };
  const { res, last, model } = await attempt(MISTRAL_MODELS, (m) => fetch(MISTRAL_ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(ATTEMPT_MS),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${MISTRAL_KEY}` },
    body: JSON.stringify({
      model: m,
      temperature: 0,
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: `data:${mimeType};base64,${data}` }] }],
      response_format: { type: 'json_schema', json_schema: { name: 'image_review', schema: jsonSchema(SCHEMA), strict: true } },
    }),
  }));
  if (!res) return { failed: unreachable('Mistral', MISTRAL_MODELS, last) };
  const body = (await res.json().catch(() => null)) as MistralResponse | null;
  if (!res.ok) {
    const detail = body?.message ?? (body?.detail ? JSON.stringify(body.detail).slice(0, 300) : 'no detail given');
    return { failed: fail(502, `Mistral answered ${res.status}${BUSY.includes(res.status) ? ` on every attempt (${MISTRAL_MODELS.join(', ')})` : ''}: ${detail}`) };
  }
  const content = body?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : (content ?? []).map((c) => c.text ?? '').join('');
  return { model, text };
}

export async function POST(req: Request) {
  let form: FormData;
  try { form = await req.formData(); } catch { return fail(400, 'Send the picture as multipart form data, in a field named "file".'); }
  const file = form.get('file');
  const asked = form.get('provider');
  const provider: Provider = PROVIDERS.includes(asked as Provider) ? (asked as Provider) : DEFAULT_PROVIDER;
  if (!(file instanceof File)) return fail(400, 'No picture in the request.');
  if (!ACCEPT.includes(file.type)) return fail(415, 'Only JPG, PNG or WebP pictures can be analysed.');
  if (file.size > MAX_BYTES) return fail(413, 'That picture is over the 8 MB limit.');

  const data = Buffer.from(await file.arrayBuffer()).toString('base64');
  const started = Date.now();
  const answer = provider === 'mistral' ? await askMistral(file.type, data) : await askGemini(file.type, data);
  if ('failed' in answer) return answer.failed;
  const { model: MODEL, blocked, text } = answer;
  const NAME = PROVIDER_NAME[provider];
  const seconds = Math.round((Date.now() - started) / 100) / 10;

  /* A refusal is itself the answer to the indecency question, so it is reported as one rather than as an error. */
  if (blocked && !text) {
    const none = { score: 0, reason: 'Not assessed: the model refused the image before judging it.' };
    return Response.json({
      provider, model: MODEL, seconds, blocked,
      ai_generated: none, tampered: { ...none, suspect_areas: [] }, misleading: { ...none, signals: [], needs_checking: [], items_checked: [] }, spam: { ...none, category: 'none', signals: [] },
      indecent: { score: 100, reason: `${NAME}'s safety filter refused this image (${blocked}), which it does for explicit or prohibited content.` },
      extracted_text: '', summary: 'The image was refused by the safety filter, so only the indecency check has an answer.',
    });
  }

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text); } catch { return fail(502, `${NAME} returned something that is not JSON, so there is no result to show.`); }

  const out: Record<string, unknown> = { provider, model: MODEL, seconds, blocked: null };
  for (const id of CHECKS) {
    const v = (parsed[id] ?? {}) as { score?: unknown; reason?: unknown; suspect_areas?: unknown; signals?: unknown; needs_checking?: unknown; items_checked?: unknown };
    if (id === 'misleading') {
      const checked = items(v.items_checked);
      const conflicts = checked.filter((it) => it.status === 'conflict');
      /* The list of signals is rebuilt from the item-by-item pass when the model left it short, so a conflict it found cannot go unreported. */
      const signals = list(v.signals);
      for (const it of conflicts) if (!signals.some((sig) => sig.includes(it.value))) signals.push(`"${it.value}" — ${it.note}`);
      out[id] = {
        score: signals.length ? Math.max(clamp(v.score), FLAG_FLOOR) : clamp(v.score),
        reason: str(v.reason), signals, needs_checking: list(v.needs_checking), items_checked: checked,
      };
      continue;
    }
    if (id === 'spam') {
      const signals = list(v.signals);
      const category = typeof (v as { category?: unknown }).category === 'string' ? (v as { category: string }).category : 'none';
      /* A named kind of spam or a single signal flags the image, whatever score came with it. */
      const hit = signals.length > 0 || category !== 'none';
      out[id] = { score: hit ? Math.max(clamp(v.score), FLAG_FLOOR) : clamp(v.score), reason: str(v.reason), category, signals };
      continue;
    }
    out[id] = {
      score: clamp(v.score),
      reason: str(v.reason),
      ...(id === 'tampered' ? { suspect_areas: list(v.suspect_areas) } : {}),
    };
  }
  out.extracted_text = str(parsed.extracted_text);
  out.summary = str(parsed.summary);
  return Response.json(out);
}
