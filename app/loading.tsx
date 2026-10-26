export default function Loading() {
  return (
    <div className="animate-pulse space-y-4 pt-4">
      <div className="h-3 w-40 rounded bg-rule" /><div className="h-9 w-2/3 rounded bg-rule" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2 border-b rule py-4"><div className="h-3 w-1/3 rounded bg-rule" /><div className="h-5 w-11/12 rounded bg-rule" /><div className="h-3 w-1/2 rounded bg-rule" /></div>)}
    </div>
  );
}
