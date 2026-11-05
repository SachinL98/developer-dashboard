/** Shown instantly while the next page loads on the server, so a click always gives visible feedback. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-panel2" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card h-28 animate-pulse bg-panel2/60" />)}
      </div>
      <div className="card h-72 animate-pulse bg-panel2/60" />
      <div className="card h-48 animate-pulse bg-panel2/60" />
    </div>
  );
}
