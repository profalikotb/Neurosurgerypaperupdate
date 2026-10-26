"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto mt-[10vh] max-w-lg text-center">
      <h1 className="font-serif text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 break-words text-[14px] text-muted">{error.message}</p>
      <button onClick={reset} className="link mt-4">Try again</button>
    </div>
  );
}
