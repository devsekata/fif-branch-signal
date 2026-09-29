#!/usr/bin/env node
/**
 * Checks `topics[].answered` on /v1/pages/social against the threads in the same payload.
 *
 *   node scripts/check-social-topics.mjs                 # live API, source=all
 *   node scripts/check-social-topics.mjs --save out.json # also write the raw payload
 *   node scripts/check-social-topics.mjs --file out.json # read a saved payload instead
 *
 * Base URL follows NEXT_PUBLIC_API_BASE_URL, like lib/api.ts.
 */
import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api-fif.kepiai.co').replace(/\/+$/, '');

async function load() {
  const file = opt('--file');
  if (file) return JSON.parse(await readFile(file, 'utf8'));
  const url = `${BASE}/v1/pages/social?source=${opt('--source') ?? 'all'}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  const data = await res.json();
  const save = opt('--save');
  if (save) await writeFile(save, JSON.stringify(data, null, 2));
  return data;
}

const d = await load();
const threads = d.threads ?? [];
const oneLine = (s, n = 90) => (s ?? '').replace(/\s+/g, ' ').slice(0, n);

console.log('== Ringkasan API ==');
const S = d.summary ?? {};
console.log(`threads ${S.threads}, complaint_threads ${S.complaint_threads}, unanswered ${S.unanswered}, brand_reply_rate_pct ${S.brand_reply_rate_pct}`);
console.log('response_funnel', JSON.stringify(d.response_funnel));

console.log('\n== Topics: API vs hitung ulang dari threads ==');
const rows = (d.topics ?? []).map((t) => {
  const m = threads.filter((x) => (x.topic_ids ?? []).includes(t.topic_id));
  const replied = m.filter((x) => x.brand_replied).length;
  return {
    topic_id: t.topic_id, n_api: t.n, n_threads: m.length,
    answered_api: t.answered, answered_threads: replied,
    cocok: t.n === m.length && t.answered === replied ? 'ya' : 'TIDAK',
  };
});
console.table(rows);

console.log('\n== Reply dari brand ==');
const replies = threads.flatMap((t) => (t.replies ?? []).map((r) => ({ ...r, thread: t.thread_id })));
const brand = replies.filter((r) => r.is_brand);
console.log(`thread brand_replied: ${threads.filter((t) => t.brand_replied).length} dari ${threads.length}`);
console.log(`reply is_brand: ${brand.length} dari ${replies.length}`);
console.log('penulis reply:', [...new Set(replies.map((r) => r.author))].join(', ') || '—');

console.log('\n== Isi komentar per topik (cek tagging) ==');
for (const t of d.topics ?? []) {
  console.log(`\n[${t.topic_id}] ${t.label}`);
  for (const x of threads.filter((x) => (x.topic_ids ?? []).includes(t.topic_id))) {
    console.log(`  - ${x.sentiment} | ${x.brand_replied ? 'dibalas' : 'belum'} | ${x.author} | ${oneLine(x.text)}`);
  }
}
