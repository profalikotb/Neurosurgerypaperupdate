import Link from "next/link";
export default function NotFound() {
  return <div className="mx-auto mt-[10vh] max-w-md text-center"><h1 className="font-serif text-2xl font-bold">Not found</h1><p className="mt-2 text-muted">This item does not exist or was removed.</p><Link href="/" className="link mt-4 inline-block">Back to today</Link></div>;
}
