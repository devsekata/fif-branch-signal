'use client';

import { useState } from 'react';
import { SekataState } from '@/components/SekataGate';
import { PanelHead } from '@/components/ui';
import {
  newBrand, saveBrand, setBrandActive, useBrands, type Brand,
} from '@/lib/sentiments';

export function SettingsView() {
  const res = useBrands();
  return (
    <section className="page">
      <SekataState res={res}>
        {(brands) => <Brands brands={brands} />}
      </SekataState>
    </section>
  );
}

function Brands({ brands }: { brands: Brand[] }) {
  const [editing, setEditing] = useState<Brand | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [error, setError] = useState('');

  const listed = brands.filter((b) => showInactive || b.active);

  async function toggle(b: Brand) {
    setToggling(b.id);
    setError('');
    try { await setBrandActive(b.id!, !b.active); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setToggling(null); }
  }

  return (
    <>
      <div className="panel mb">
        <PanelHead
          title="Brand setup"
          tag={editing ? undefined : <button className="btn" onClick={() => setEditing(newBrand())}>Add brand</button>}
        />
        <div className="p-note">
          What the analyser treats as this brand, and what it is told to look for. Aliases catch the
          misspellings customers actually type; the watch list decides what counts as a complaint.
        </div>
        {editing && <BrandForm key={editing.id ?? 'new'} brand={editing} onDone={() => setEditing(null)} />}
      </div>

      <div className="panel">
        <PanelHead
          title="Configured brands"
          tag={
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-3)', cursor: 'pointer', fontWeight: 400 }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
          }
        />
        <div className="t-scroll">
          <table>
            <thead>
              <tr>
                <th>Brand</th><th>Aliases</th><th>Watch for</th>
                <th>Discovery</th><th>Created</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {listed.length ? listed.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.name}</b></td>
                  <td>{b.aliases.length ? b.aliases.map((a) => <span key={a} className="tag" style={{ marginRight: 4 }}>{a}</span>) : <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
                  <td style={{ maxWidth: 320, color: 'var(--ink-2)' }}>{b.watchFor || '—'}</td>
                  <td>
                    {b.searchKeyword
                      ? <>“{b.searchKeyword}”<div className="sub">{b.searchMaxPosts} posts{b.autoSearch ? ` · daily ${b.searchTime}` : ' · manual only'}</div></>
                      : <span style={{ color: 'var(--ink-3)' }}>off</span>}
                  </td>
                  <td className="mono">{b.createdAt}</td>
                  <td style={{ color: b.active ? 'var(--grow)' : 'var(--ink-3)', fontWeight: 600 }}>{b.active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <button className="btn2" onClick={() => setEditing(b)}>Edit</button>
                    <div style={{ marginTop: 5 }}>
                      <button className="link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
                        disabled={toggling === b.id} onClick={() => toggle(b)}>
                        {toggling === b.id ? 'Saving…' : b.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7}><div className="empty">No brands configured yet. Add one to start monitoring.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {error && <div className="sub warn-text" role="alert" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    </>
  );
}

function BrandForm({ brand, onDone }: { brand: Brand; onDone: () => void }) {
  const [f, setF] = useState<Brand>(brand);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => setF((p) => ({ ...p, [k]: v }));

  const nameOk = f.name.trim().length > 0;
  const watchOk = f.watchFor.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!nameOk || !watchOk || saving) return;
    setSaving(true);
    setError('');
    try {
      await saveBrand({ ...f, name: f.name.trim(), watchFor: f.watchFor.trim(), searchKeyword: f.searchKeyword.trim() });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ borderTop: '1px solid var(--rule)', marginTop: 14, paddingTop: 16 }} noValidate>
      <div className="grid g-2">
        <label className="field">
          <span>Brand name</span>
          <input className="ctl-text" value={f.name} placeholder="e.g. FIFGROUP" autoFocus
            onChange={(e) => set('name', e.target.value)} aria-invalid={touched && !nameOk} />
          <span className="sub">The name people will see on a case.</span>
        </label>
        <label className="field">
          <span>Aliases</span>
          <textarea className="compose" style={{ minHeight: 84 }} value={f.aliases.join('\n')}
            placeholder={'fif\nfif group\nfifclub'}
            onChange={(e) => set('aliases', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} />
          <span className="sub">One per line. Spellings, abbreviations and the typos customers actually use.</span>
        </label>
      </div>

      <label className="field">
        <span>Watch for</span>
        <textarea className="compose" style={{ minHeight: 96 }} value={f.watchFor}
          placeholder="Collection conduct, alleged misappropriation, exposed personal data, claim and BPKB delays…"
          onChange={(e) => set('watchFor', e.target.value)} aria-invalid={touched && !watchOk} />
        <span className="sub">The complaint scenarios the analyser judges a post against. This decides what counts, not what gets found.</span>
      </label>

      <div className="p-head" style={{ marginTop: 18 }}><h3>Automated discovery</h3><span className="p-tag">optional</span></div>
      <div className="p-note">
        Leave the keyword empty to analyse only the links you paste yourself.
      </div>
      <div className="grid g-3">
        <label className="field">
          <span>Search keyword</span>
          <input className="ctl-text" value={f.searchKeyword} placeholder="FIF Group keluhan"
            onChange={(e) => { set('searchKeyword', e.target.value); if (!e.target.value.trim()) set('autoSearch', false); }} />
        </label>
        <label className="field">
          <span>Max posts per search</span>
          <input className="ctl-text" type="number" min={1} max={50} value={f.searchMaxPosts}
            onChange={(e) => set('searchMaxPosts', Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
          <span className="sub">The connector caps this at 50.</span>
        </label>
        <label className="field">
          <span>Run daily at</span>
          <input className="ctl-text" type="time" value={f.searchTime} disabled={!f.autoSearch}
            onChange={(e) => set('searchTime', e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer', marginTop: 7 }}>
            <input type="checkbox" checked={f.autoSearch} disabled={!f.searchKeyword.trim()}
              onChange={(e) => set('autoSearch', e.target.checked)} />
            Search once a day, Jakarta time
          </label>
        </label>
      </div>

      {touched && (!nameOk || !watchOk) && (
        <div className="sub warn-text" style={{ marginBottom: 10 }}>
          {!nameOk ? 'Give the brand a name. ' : ''}{!watchOk ? 'Say what the analyser should watch for.' : ''}
        </div>
      )}

      {error && <div className="sub warn-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

      <div className="cc" style={{ marginTop: 4 }}>
        <button className="btn2 solid" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save brand'}</button>
        <button className="btn2" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
