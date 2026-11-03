import type { PlanDocument } from '../../../model/types.ts';
import type { Role } from '../../../wayfinding/walkthrough/contracts.ts';
import { buildWalkItemRegistry } from '../../../wayfinding/walkthrough/foundation/item-registry.ts';

export function ItemCoverage({ document, role }: { document: PlanDocument; role: Role }) {
  const registry = buildWalkItemRegistry({
    role,
    instances: document.instances.map((item) => ({
      id: item.id,
      assetId: item.assetId,
      label: item.label,
      floorId: item.floorId,
      collidable: item.collidable,
    })),
  });
  const rows = [...registry.assets, ...registry.instances, ...registry.connectors];
  return <section aria-labelledby="item-coverage-title" className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-700 p-4"><h2 id="item-coverage-title" className="text-lg font-semibold">D10 item coverage</h2><p className="text-xs text-slate-400">{registry.assets.length} catalog IDs · {registry.instances.length} placed instances · {registry.connectors.length} connectors · role {role}</p></div>
    <div className="max-h-[32rem] overflow-auto"><table className="w-full border-collapse text-left text-xs"><thead className="sticky top-0 bg-slate-800 text-slate-300"><tr>{['Type / ID','Inspect','Use','Navigation','Collision / geometry'].map((name) => <th key={name} className="p-2">{name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={`${row.kind}:${row.id}`} className="border-t border-slate-800 align-top"><th className="p-2 font-mono font-normal"><span className="block text-slate-500">{row.kind}</span>{row.id}<span className="block font-sans text-slate-400">{row.label}</span></th><td className="p-2">{row.inspect.status === 'available' ? `available (${row.inspect.source})` : `UNAVAILABLE: ${row.inspect.reason}`}</td><td className="p-2">{row.use.map((use, i) => <div key={`${use.descriptorId ?? 'none'}:${i}`}>{use.status === 'available' ? `available: ${use.label} (confirmation ${use.requiresConfirmation ? 'required' : 'not required'})` : `UNAVAILABLE: ${use.reason}`}</div>)}</td><td className="p-2">{row.navigation}</td><td className="p-2">{row.collision}</td></tr>)}</tbody></table></div>
    <p className="border-t border-slate-700 p-3 text-xs text-amber-200">Dimensions, rendered extents, and unsupported connector geometry are UNKNOWN unless explicitly supplied by the source registry. This registry reports declared capability, not proof of live interaction.</p>
  </section>;
}
