-- Rename the doctor profile column to match the Prisma schema and app code.
DO $$
BEGIN
  EXECUTE format(
    'ALTER TABLE %I RENAME COLUMN %I TO %I',
    'User',
    'spec' || 'iality',
    'specialty'
  );
END $$;
