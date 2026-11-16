// Supabase Edge Function: calendar-proxy
//
// Downloads the signed-in user's published calendar (.ics) for the Time Tracker app.
// Browsers aren't allowed to download Outlook/Teams calendar links directly (CORS), so the
// app asks this function instead. It only ever fetches the link saved in the caller's own
// calendar_settings row (row-level security), and only from the calendar hosts below.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → Via editor,
// name it "calendar-proxy", paste this file, Deploy. Keep "Verify JWT" turned on.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_HOSTS = [
  'outlook.office365.com',
  'outlook.office.com',
  'outlook.live.com',
  'calendar.google.com',
];
const MAX_BYTES = 10_000_000;
const MAX_REDIRECTS = 3;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

function allowed(url: URL) {
  return url.protocol === 'https:' && ALLOWED_HOSTS.includes(url.hostname.toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return fail(401, 'Not signed in.');

  const { data, error } = await db
    .from('calendar_settings')
    .select('ics_url')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) return fail(500, "Couldn't read your calendar settings.");
  if (!data) return fail(404, 'No calendar link saved yet.');

  let url: URL;
  try {
    url = new URL(String(data.ics_url).trim().replace(/^webcal:/i, 'https:'));
  } catch {
    return fail(400, "The saved calendar link isn't a valid web address.");
  }

  // Follow redirects by hand so every hop stays on an allowed calendar host.
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!allowed(url)) return fail(400, `Calendar links must be https links from: ${ALLOWED_HOSTS.join(', ')}.`);
    try {
      res = await fetch(url, {
        redirect: 'manual',
        headers: { Accept: 'text/calendar' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return fail(502, "Couldn't reach the calendar server. Try again in a minute.");
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    break;
  }
  if (!res || !res.ok) {
    return fail(502, `The calendar server answered ${res?.status ?? 'nothing'}. Check that the calendar is still published.`);
  }

  const text = await res.text();
  if (text.length > MAX_BYTES) return fail(502, 'That calendar is too large to sync.');
  if (!text.includes('BEGIN:VCALENDAR')) return fail(502, "That link didn't return a calendar. Use the ICS link, not the HTML one.");

  return new Response(text, {
    headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
});
