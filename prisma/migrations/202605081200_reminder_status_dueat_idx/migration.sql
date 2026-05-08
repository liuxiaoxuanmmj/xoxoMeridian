-- Speed up scheduler polling: WHERE status='pending' AND dueAt <= now ORDER BY dueAt ASC
CREATE INDEX IF NOT EXISTS "Reminder_status_dueAt_idx" ON "Reminder"("status", "dueAt");
