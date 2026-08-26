import { supabase } from './supabase'

/* Write an admin action to audit_logs (fire-and-forget safe). */
export async function logAudit(
  adminUserId: string,
  targetUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  oldValue?: string | null,
  newValue?: string | null,
  reason?: string | null,
) {
  try {
    await supabase.from('audit_logs').insert({
      admin_user_id: adminUserId,
      target_user_id: targetUserId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      reason: reason ?? null,
    })
  } catch {
    /* auditing must never break the main action */
  }
}
