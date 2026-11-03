import type { PlanDocument } from '../../../model/types.ts';
import type { Role } from '../../../wayfinding/walkthrough/contracts.ts';
import { buildWalkItemRegistry } from '../../../wayfinding/walkthrough/foundation/item-registry.ts';

export function ItemCoverage({ document, role }: { document: PlanDocument; role: Role }) {
  const registry = buildWalkItemRegistry({ role });
  const objectRows = document.floors.flatMap((floor) => floor.objects.map((object) => ({
    key: `object:${floor.source.id}:${object.id}`,
    kind: 'Placed object',
    id: object.id,
    label: `${object.name} · recipe ${object.recipe} · floor ${floor.source.id}`,
  })));
  const portalRows = (document.ownedPortalIds ?? []).map((id) => ({
    key: `portal:${id}`,
    kind: 'Owned portal',
    id,
    label: 'Portal',
  }));
  const metadataRows = [...registry.assets, ...registry.instances, ...registry.connectors].map((row) => ({
    key: `catalog:${row.kind}:${row.id}`,
    kind: `Catalog metadata · ${row.kind}`,
    id: row.id,
    label: row.label,
  }));
  const rows = [...objectRows, ...portalRows, ...metadataRows];
  return <section aria-labelledby="item-coverage-title" className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-700 p-4"><h2 id="item-coverage-title" className="text-lg font-semibold">D10 item coverage</h2><p className="text-xs text-slate-400">{objectRows.length} placed objects · {portalRows.length} owned portals · {metadataRows.length} catalog metadata rows · role {role}</p></div>
    <p className="border-b border-slate-700 px-4 py-2 text-xs text-amber-200">Capability values are UNKNOWN unless explicitly proven by runtime support; catalog metadata is not runtime evidence.</p>
    <div className="max-h-[32rem] overflow-auto"><table className="w-full border-collapse text-left text-xs"><thead className="sticky top-0 bg-slate-800 text-slate-300"><tr>{['Type / ID','Inspect','Use','Navigation','Collision / geometry'].map((name) => <th key={name} className="p-2">{name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.key} className="border-t border-slate-800 align-top"><th className="p-2 font-mono font-normal"><span className="block text-slate-500">{row.kind}</span>{row.id}<span className="block font-sans text-slate-400">{row.label}</span></th><td className="p-2">UNKNOWN</td><td className="p-2">UNKNOWN</td><td className="p-2">UNKNOWN</td><td className="p-2">UNKNOWN</td></tr>)}</tbody></table></div>
    <p className="border-t border-slate-700 p-3 text-xs text-amber-200">Dimensions, rendered extents, interaction behavior, and collision behavior are UNKNOWN without explicit runtime evidence.</p>
  </section>;
}
