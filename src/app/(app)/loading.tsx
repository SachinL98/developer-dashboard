/** Shown instantly while the next page loads on the server, so a click always gives visible feedback. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2 border-b border-line/70 pb-5"><div className="skeleton h-7 w-56" /><div className="skeleton h-4 w-80 max-w-full" /></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card space-y-3 p-5"><div className="skeleton h-4 w-24" /><div className="skeleton h-8 w-20" /><div className="skeleton h-3 w-32" /></div>)}
      </div>
      <div className="card h-72 animate-pulse bg-panel2/50" />
      <div className="card h-48 animate-pulse bg-panel2/50" />
    </div>
  );
}
