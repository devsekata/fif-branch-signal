/* Proxy to the Sekata Insight Connector, signed in as one service account.
 *
 * The connector only knows Flask session cookies: no token, no CORS. So the server signs in
 * with SEKATA_EMAIL / SEKATA_PASSWORD from .env.local, keeps the cookie in memory, and forwards
 * the dashboard's calls with it. Nobody using the dashboard sees a Sekata sign-in.
 *
 * That also means anyone who can open this dashboard can read and write through that account,
 * the same way the FIF API is open today. Only /api/* is forwarded; /login, /logout and the
 * connector's own HTML pages are not reachable through here. */

const BASE = (process.env.SEKATA_API_BASE_URL ?? 'https://sekata-autometric.up.railway.app').replace(/\/+$/, '');

let cookie: string | null = null;
let signingIn: Promise<string> | null = null;

async function signIn(): Promise<string> {
  const email = process.env.SEKATA_EMAIL;
  const password = process.env.SEKATA_PASSWORD;
  if (!email || !password) throw new Error('SEKATA_EMAIL and SEKATA_PASSWORD are not set in .env.local.');

  /* /login is an HTML form: a redirect with a session cookie on success, the form again on failure. */
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  });
  const session = res.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('session='));
  if (res.status !== 302 || !session) throw new Error('The Sekata connector rejected SEKATA_EMAIL / SEKATA_PASSWORD.');
  return session;
}

/** One sign-in at a time; concurrent requests wait on the same one. */
function session(fresh: boolean): Promise<string> {
  if (!fresh && cookie) return Promise.resolve(cookie);
  signingIn ??= signIn().then(
    (c) => { cookie = c; signingIn = null; return c; },
    (e) => { cookie = null; signingIn = null; throw e; },
  );
  return signingIn;
}

async function forward(req: Request, path: string[]): Promise<Response> {
  if (path[0] !== 'api') return Response.json({ error: 'Only /api routes are forwarded.' }, { status: 404 });

  const url = `${BASE}/${path.map(encodeURIComponent).join('/')}${new URL(req.url).search}`;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
  const send = (c: string) => fetch(url, {
    method: req.method,
    redirect: 'manual',
    headers: {
      cookie: c,
      accept: req.headers.get('accept') ?? '*/*',
      ...(req.headers.get('content-type') ? { 'content-type': req.headers.get('content-type')! } : {}),
    },
    body,
  });

  let res: Response;
  try {
    res = await send(await session(false));
    /* The cookie expires or the connector restarts with a new SECRET_KEY: sign in again once. */
    if (res.status === 401) res = await send(await session(true));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  const headers = new Headers();
  for (const h of ['content-type', 'cache-control']) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Ctx) { return forward(req, (await ctx.params).path); }
export async function POST(req: Request, ctx: Ctx) { return forward(req, (await ctx.params).path); }
export async function PUT(req: Request, ctx: Ctx) { return forward(req, (await ctx.params).path); }
export async function DELETE(req: Request, ctx: Ctx) { return forward(req, (await ctx.params).path); }
