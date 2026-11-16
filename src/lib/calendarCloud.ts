import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import type { CalendarOptions, SyncDeps } from './calendar';

export interface CalendarSettings extends CalendarOptions {
  icsUrl: string;
}

export async function loadCalendarSettings(db: SupabaseClient, userId: string): Promise<CalendarSettings | null> {
  const { data, error } = await db
    .from('calendar_settings')
    .select('ics_url,title_target,entry_type')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { icsUrl: data.ics_url, titleTarget: data.title_target, entryType: data.entry_type };
}

export async function saveCalendarSettings(db: SupabaseClient, userId: string, s: CalendarSettings) {
  const { error } = await db.from('calendar_settings').upsert({
    user_id: userId,
    ics_url: s.icsUrl.trim(),
    title_target: s.titleTarget,
    entry_type: s.entryType.trim() || 'Meeting',
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function removeCalendarSettings(db: SupabaseClient, userId: string) {
  const { error } = await db.from('calendar_settings').delete().eq('user_id', userId);
  if (error) throw error;
}

/** Talks to Supabase for a sync: the calendar-proxy function and the calendar_imports table. */
export function cloudSyncDeps(db: SupabaseClient, userId: string): SyncDeps {
  return {
    async fetchIcs() {
      const { data, error } = await db.functions.invoke('calendar-proxy', { method: 'POST' });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null);
          throw new Error(body?.error ?? 'Calendar sync failed.');
        }
        throw new Error(
          error.name === 'FunctionsFetchError'
            ? "Couldn't reach the calendar-proxy function. Is it deployed in Supabase?"
            : error.message,
        );
      }
      return typeof data === 'string' ? data : await new Response(data as BodyInit).text();
    },
    async importedKeys(keys) {
      const { data, error } = await db
        .from('calendar_imports')
        .select('event_key')
        .eq('user_id', userId)
        .in('event_key', keys);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.event_key as string));
    },
    async claim(keys) {
      // ON CONFLICT DO NOTHING: only keys inserted by this call come back, so two devices
      // syncing at once can't both add the same meeting.
      const { data, error } = await db
        .from('calendar_imports')
        .upsert(keys.map((event_key) => ({ user_id: userId, event_key })), { onConflict: 'user_id,event_key', ignoreDuplicates: true })
        .select('event_key');
      if (error) throw error;
      // Housekeeping: only today's keys matter, so drop records older than 60 days.
      const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString();
      await db.from('calendar_imports').delete().eq('user_id', userId).lt('created_at', cutoff);
      return new Set((data ?? []).map((r) => r.event_key as string));
    },
  };
}
