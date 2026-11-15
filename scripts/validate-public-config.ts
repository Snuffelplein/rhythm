export function validatePublicConfig(env: Record<string, string>, csp: string) {
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY mag alleen een publieke publishable key bevatten. Geen secret-, service-role- of legacy JWT-sleutel gebruiken.');
  if (env.VITE_SUPABASE_URL) {
    let url: URL;
    try { url = new URL(env.VITE_SUPABASE_URL); } catch { throw new Error('VITE_SUPABASE_URL is ongeldig.'); }
    const connections = csp.split(';').find(rule => rule.trim().startsWith('connect-src '))?.trim().split(/\s+/).slice(1) ?? [];
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname) || !connections.includes(url.origin)) throw new Error('De Supabase-URL moet HTTPS gebruiken en expliciet in de connect-src van vercel.json staan.');
  }
}
