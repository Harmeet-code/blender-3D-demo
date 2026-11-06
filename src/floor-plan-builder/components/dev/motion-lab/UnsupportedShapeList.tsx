export function UnsupportedShapeList({
  issues,
}: {
  issues: readonly { id: string; reason: string }[];

}) {
  if (issues.length === 0) {return null;}

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

    </section>
  );
}
