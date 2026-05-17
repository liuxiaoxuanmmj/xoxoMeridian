-- DropReminder: remove the Reminder table and ReminderStatus enum.
-- One-time reminders are now handled by ScheduledJob (runOnce / fireAt).

DROP TABLE IF EXISTS "Reminder";

DROP TYPE IF EXISTS "ReminderStatus";
