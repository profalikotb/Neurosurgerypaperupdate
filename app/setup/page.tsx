export default function Setup() {
  return (
    <div className="mx-auto mt-[10vh] max-w-xl">
      <h1 className="font-serif text-2xl font-bold text-navy">Setup required</h1>
      <p className="mt-2 text-[15px] text-ink-2">Supabase environment variables are missing. In Vercel → Project → Settings → Environment Variables add the values from <code className="font-mono">.env.example</code> (at minimum <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code>, <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>, <code className="font-mono">LLM_API_KEY</code>, <code className="font-mono">CRON_SECRET</code>), then redeploy. See README → Deployment.</p>
    </div>
  );
}
