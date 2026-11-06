import { useMemo } from 'react';
import type { PlanDocument } from '../../../model/types.ts';
import type { Role } from '../../../wayfinding/walkthrough/contracts.ts';
import { buildCoverage, measureCatalog } from './item-coverage-data.ts';

export function ItemCoverage({ document, role }: { document: PlanDocument; role: Role }) {
  const catalog = useMemo(measureCatalog, []);
  const coverage = useMemo(() => buildCoverage(document, role, catalog), [document, role, catalog]);
  return <section aria-labelledby="item-coverage-title" className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
    <div className="border-b border-slate-700 p-4">
      <h2 id="item-coverage-title" className="text-lg font-semibold">D10 item coverage</h2>
      <p className="text-xs text-slate-400">{coverage.summary} · role {role}</p>
      <p className="mt-2 text-xs text-amber-200">Source-derived capabilities and computed geometry, not a live acceptance result. D10 live review remains UNVERIFIED. Metadata dimensions are declarations, never collision or interaction proof.</p>
      <p className="mt-2 text-xs text-amber-200">{coverage.inventory.reconciliation}</p>
      <details className="mt-2 text-xs text-slate-300"><summary>Exact source inventory and reconciliation</summary>
        {coverage.inventory.families.map((family) => <p key={family.source} className="mt-2 break-words"><code>{family.source}</code> ({family.ids.length}): {family.ids.join(', ')}</p>)}
        <p>Overlapping / duplicate source memberships: {coverage.inventory.duplicates.join(', ') || 'none'}</p>
        {coverage.inventory.comparisons.map((source) => <p key={source.name}>{source.name}: {source.ids.length} records; missing IDs: {source.missing.join(', ') || 'none'}</p>)}
      </details>
      {coverage.issues.map((issue, index) => <p key={index} className="text-xs text-red-300">BLOCKER: {issue}</p>)}
    </div>
    <div className="max-h-[40rem] overflow-auto"><table className="w-full border-collapse text-left text-xs">
      <thead className="sticky top-0 bg-slate-800 text-slate-300"><tr>{['Source / schema / linkage', 'Dimensions / transform / geometry', 'Inspect / role projection', 'Use', 'Navigation', 'Collision', 'Multifloor', 'Evidence'].map((name) => <th key={name} scope="col" className="min-w-48 p-2">{name}</th>)}</tr></thead>
      <tbody>{coverage.rows.map((row) => <tr key={row.key} className="border-t border-slate-800 align-top">
        <th scope="row" className="p-2 text-left font-normal"><span className="block text-slate-500">{row.kind}</span><span className="font-mono">{row.id}</span><p>{row.source}</p></th>
        {[row.geometry, row.inspect, row.use, row.navigation, row.collision, row.multifloor].map((value, index) => <td key={index} className="whitespace-pre-wrap p-2">{value}</td>)}
        <td className="p-2">{row.evidence.map((path) => <code key={path} className="mb-2 block break-all text-slate-400">{path}</code>)}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="border-t border-slate-700 p-3 text-xs text-amber-200">Units: metres, radians; building coordinates exclude walkthrough scene origin offset. UNKNOWN means no observation or adapter input. UNAVAILABLE means an explicit source restriction. Catalog rows describe unplaced assets. Matching persisted and placed records share one instance row. Duplicate identities and unresolved references are blockers. Rendered world bounds, physical traversal, live dwell and role enforcement require fresh live review.</p>
  </section>;
}
