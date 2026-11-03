import type { SupabaseClient } from '@supabase/supabase-js';

export type Permission = 'view' | 'edit';

/** A share in either direction: 'out' = you shared your log, 'in' = someone shared theirs with you. */
export interface Share {
  id: string;
  direction: 'in' | 'out';
  otherId: string;
  otherEmail: string;
  otherName: string;
  permission: Permission;
  hideNotes: boolean;
}

/** What to call the other person: their display name, or their email if they haven't set one. */
export const shareLabel = (s: Share) => s.otherName.trim() || s.otherEmail;

export async function listShares(db: SupabaseClient): Promise<Share[]> {
  const { data, error } = await db.rpc('list_shares');
  if (error) throw error;
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    direction: r.direction as 'in' | 'out',
    otherId: r.other_id as string,
    otherEmail: r.other_email as string,
    otherName: (r.other_name as string) ?? '',
    permission: r.permission as Permission,
    hideNotes: !!r.hide_notes,
  }));
}

/** Shares your log. Succeeds quietly even if the email has no account (by design). */
export async function shareLog(db: SupabaseClient, email: string, permission: Permission, hideNotes: boolean) {
  const { error } = await db.rpc('share_log', { p_email: email.trim(), p_permission: permission, p_hide_notes: hideNotes });
  if (error) throw error;
}

export async function updateShare(db: SupabaseClient, id: string, permission: Permission, hideNotes: boolean) {
  const { error } = await db
    .from('shares')
    .update({ permission, hide_notes: permission === 'view' && hideNotes })
    .eq('id', id);
  if (error) throw error;
}

/** Ends a share. Works for both sides: the owner removing access, or the viewer leaving. */
export async function removeShare(db: SupabaseClient, id: string) {
  const { error } = await db.from('shares').delete().eq('id', id);
  if (error) throw error;
}

export async function loadDisplayName(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from('profiles').select('display_name').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.display_name as string | undefined) ?? '';
}

export async function saveDisplayName(db: SupabaseClient, userId: string, name: string) {
  const { error } = await db.from('profiles').upsert({ user_id: userId, display_name: name.trim().slice(0, 60) });
  if (error) throw error;
}
