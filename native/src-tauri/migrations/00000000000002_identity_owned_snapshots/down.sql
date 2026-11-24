-- Restoring the pre-migration backup is the supported rollback for this
-- identity-splitting transformation. Never discard identity-owned data.
SELECT * FROM archive_identity_split_requires_backup_restore;
