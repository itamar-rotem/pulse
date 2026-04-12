-- Expression index on rules.scope->>'projectId' for COST_CAP_PROJECT lookups.
-- syncBudgetRule and disableBudgetRule both filter on this JSON path; without
-- the index every call does a full table scan of the rules table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "rules_scope_project_id_idx"
  ON "rules" ((scope->>'projectId'))
  WHERE type = 'COST_CAP_PROJECT';
