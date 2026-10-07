'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { ApiPage, EmptyRow, PanelHead } from '@/components/ui';
import { useApi } from '@/lib/api';
import {
  AREA_LEVELS, AREA_METRICS, areaScale, groupByLevel,
  type AreaLevel, type AreaMetric, type KabkotaProps, type KecamatanProps, type RegionCollection,
} from '@/lib/kecamatan';
import { useScope } from '@/lib/scope';
import type { AreaBranchRow, AreaBranchesResponse } from '@/lib/types';

const KecamatanMap = dynamic(() => import('@/components/KecamatanMap'), {
  ssr: false,
  loading: () => <div className="kec-map kec-wait">Loading map…</div>,
});

/* The map is limited to one city for now. The API and the rest of this page work for any kabkota
 * in the master tables, so widening it is a matter of dropping this filter. */
const FOCUS = 'Kota Jakarta Barat';

export function AreaMapView() {
  const { params } = useScope('map');
  const kecamatan = useApi<RegionCollection<KecamatanProps>>('/v1/areas/kecamatan', { with_branches: 'true' });
  const kabkota = useApi<RegionCollection<KabkotaProps>>('/v1/areas/regions', { level: 'kabkota', with_branches: 'true' });
  const provinsi = useApi<RegionCollection>('/v1/areas/regions', { level: 'provinsi', with_branches: 'true' });
  const branches = useApi<AreaBranchesResponse>('/v1/areas/branches', { from: params.from });
  return (
    <ApiPage res={kecamatan}>
      {(kec) => (
        <ApiPage res={kabkota}>
          {(kab) => (
            <ApiPage res={provinsi}>
              {(prov) => (
                <ApiPage res={branches}>
                  {(d) => <AreaMap geo={{ kecamatan: kec, kabkota: kab, provinsi: prov }} all={d.rows} />}
                </ApiPage>
              )}
            </ApiPage>
          )}
        </ApiPage>
      )}
    </ApiPage>
  );
}

interface Boundaries {
  kecamatan: RegionCollection<KecamatanProps>;
  kabkota: RegionCollection<KabkotaProps>;
  provinsi: RegionCollection;
}

function AreaMap({ geo, all }: { geo: Boundaries; all: AreaBranchRow[] }) {
  const rows = useMemo(() => all.filter((r) => r.kabkota === FOCUS), [all]);
  const [metricId, setMetricId] = useState<AreaMetric>('sentiment');
  const metric = AREA_METRICS.find((m) => m.id === metricId)!;
  const scale = areaScale(metricId);
  const [level, setLevel] = useState<AreaLevel>('kecamatan');
  const onLevel = useCallback((l: AreaLevel) => setLevel(l), []);

  /* Each level draws only the focus city and the regions above it. Kept apart from the figures,
   * so changing the metric recolours the map without reframing it. */
  const outlines = useMemo(() => {
    const city = geo.kabkota.features.filter((f) => f.properties.nama === FOCUS);
    const provinces = new Set(city.map((f) => f.properties.provinsi_id));
    return {
      kecamatan: { ...geo.kecamatan, features: geo.kecamatan.features.filter((f) => f.properties.kabkota === FOCUS) },
      kabkota: { ...geo.kabkota, features: city },
      provinsi: { ...geo.provinsi, features: geo.provinsi.features.filter((f) => provinces.has(f.properties.id)) },
    };
  }, [geo]);
  const layers = useMemo(() => ({
    kecamatan: { boundaries: outlines.kecamatan, areas: groupByLevel(rows, 'kecamatan', metricId) },
    kabkota: { boundaries: outlines.kabkota, areas: groupByLevel(rows, 'kabkota', metricId) },
    provinsi: { boundaries: outlines.provinsi, areas: groupByLevel(rows, 'provinsi', metricId) },
  }), [outlines, rows, metricId]);

  return (
    <>
      <div className="panel mb">
        <div className="p-head">
          <h3>Jakarta Barat - Choropleth Map</h3>
          <select className="ctl kec-filter" aria-label="Filter the map by metric" value={metricId} onChange={(e) => setMetricId(e.target.value as AreaMetric)}>
            {AREA_METRICS.map((m) => <option key={m.id} value={m.id}>Filter by: {m.label}</option>)}
          </select>
          <span className="p-tag">{metric.label} · {AREA_LEVELS.find((l) => l.id === level)!.label}</span>
        </div>
        <KecamatanMap layers={layers} scale={scale} metricLabel={metric.label} onLevel={onLevel} />
        <div className="kec-legend">
          <div className="kec-legend-title">{metric.label} Scale</div>
          {scale.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}
          <span className="kec-levels">
            {AREA_LEVELS.map((l) => <b key={l.id} className={l.id === level ? 'on' : undefined}>{l.label}</b>)}
          </span>
        </div>
      </div>

      <div className="panel">
        <PanelHead title="Where each branch was placed" tag={`${rows.length} of ${all.length} branches are in ${FOCUS}`} />
        <div className="p-note">
          Branches carry no coordinates, so each is matched on the &ldquo;Kec.&rdquo; part of its address against the master kecamatan, and only when the address is in the same city.
        </div>
        <div className="t-scroll">
          <table>
            <thead>
              <tr><th>Branch</th><th>Kecamatan in the address</th><th>Placed in</th><th className="n">Reviews</th><th className="n">Sentiment</th><th className="n">Negative</th><th className="n">Never answered</th></tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((r) => (
                <tr key={r.branch_id}>
                  <td><b>{r.branch}</b><div className="sub">{r.address ?? r.city}</div></td>
                  <td>{r.stated_kecamatan ?? '—'}</td>
                  <td>{r.kecamatan}</td>
                  <td className="n">{r.total}</td>
                  <td className="n">{r.sentiment_score ?? '—'}</td>
                  <td className="n">{r.negative}</td>
                  <td className="n">{r.never_answered}</td>
                </tr>
              )) : <EmptyRow colSpan={7}>No branches in {FOCUS}.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
