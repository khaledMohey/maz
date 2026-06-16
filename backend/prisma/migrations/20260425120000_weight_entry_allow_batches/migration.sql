-- Drop unique so multiple weight batches can share the same calendar date on a cycle.
DROP INDEX IF EXISTS "WeightEntry_cycleId_date_key";
