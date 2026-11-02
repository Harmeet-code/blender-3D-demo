export function UnsupportedShapeList({
  issues,
  routeComfort = [],
}: {
  issues: readonly { id: string; reason: string }[];
  routeComfort?: readonly {
    floorId: string;
    clearanceP90M: number | null;
    targetMet: boolean | null;
    unavailableReason?: string;
  }[];
}) {
  if (issues.length === 0 && routeComfort.length === 0) {return null;}

  return (
    <section
      aria-label="Walkthrough geometry diagnostics"
      className={`pointer-events-auto basis-full rounded-lg border p-3 text-sm shadow-lg ${issues.length > 0 ? 'border-amber-300/40 bg-amber-950/95 text-amber-50' : 'border-white/15 bg-slate-950/95 text-white'}`}
    >
      {issues.length > 0 && (
        <>
          <h2 className="font-semibold">Movement blocked by unsupported geometry</h2>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {issues.map((issue) => (
              <li key={`${issue.id}:${issue.reason}`}>
                <code className="font-mono">{issue.id}</code>: {issue.reason}
              </li>
            ))}
          </ul>
        </>
      )}
      {routeComfort.length > 0 && (
        <div className="mt-3 border-t border-white/15 pt-2">
          <h2 className="font-semibold">Measured route center-clearance P90</h2>
          <ul className="mt-1 space-y-1 font-mono text-xs">
            {routeComfort.map((metric, index) => (
              <li key={`${metric.floorId}:${index}`}>
                {metric.floorId}: {metric.clearanceP90M === null
                  ? `UNAVAILABLE · ${metric.unavailableReason ?? 'No complete sample set.'}`
                  : `${metric.clearanceP90M.toFixed(3)} m · ${metric.targetMet ? '≥ 0.50 m target met' : 'below 0.50 m target'}`}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs opacity-75">Samples use the mounted collision map and smoothed route points at ≤0.1 m spacing.</p>
        </div>
      )}
    </section>
  );
}
