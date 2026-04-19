-- Custom per-tenant pipeline stages.
--
-- NOTE: spec said `tenant_id INTEGER` and `gen_random_uuid()`, but
-- tenants.id is UUID in this schema and existing migrations use
-- uuid_generate_v4() from the uuid-ossp extension. Using both here
-- to match the rest of the schema.
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  color VARCHAR(7) DEFAULT '#6B7280',
  position INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN DEFAULT FALSE,
  is_won BOOLEAN DEFAULT FALSE,
  is_lost BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant ON pipeline_stages(tenant_id, position);

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES pipeline_stages(id);
CREATE INDEX IF NOT EXISTS idx_referrals_stage ON referrals(stage_id);

-- ─── Seed default stages for every tenant that has none yet. ─────────
INSERT INTO pipeline_stages (tenant_id, name, slug, color, position, is_system, is_won, is_lost)
SELECT t.id, v.name, v.slug, v.color, v.position, v.is_system, v.is_won, v.is_lost
FROM tenants t
CROSS JOIN (VALUES
  ('Nouveau',     'new',       '#6B7280', 0, FALSE, FALSE, FALSE),
  ('Contacté',    'contacted', '#3B82F6', 1, FALSE, FALSE, FALSE),
  ('Qualifié',    'qualified', '#8B5CF6', 2, FALSE, FALSE, FALSE),
  ('Proposition', 'proposal',  '#F59E0B', 3, FALSE, FALSE, FALSE),
  ('Gagné',       'won',       '#10B981', 4, TRUE,  TRUE,  FALSE),
  ('Perdu',       'lost',      '#EF4444', 5, TRUE,  FALSE, TRUE)
) AS v(name, slug, color, position, is_system, is_won, is_lost)
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_stages ps WHERE ps.tenant_id = t.id
);

-- ─── Backfill stage_id on existing referrals by matching status ──────
-- status → slug mapping. Legacy values that don't exist in the default
-- set map to the closest stage: meeting→qualified, duplicate→lost.
UPDATE referrals r
   SET stage_id = ps.id
  FROM pipeline_stages ps
 WHERE r.stage_id IS NULL
   AND ps.tenant_id = r.tenant_id
   AND ps.slug = CASE r.status
                   WHEN 'meeting' THEN 'qualified'
                   WHEN 'duplicate' THEN 'lost'
                   ELSE r.status
                 END;

-- Belt-and-suspenders: any referral whose status didn't match any
-- slug (legacy values, typos, future custom slugs) falls back to the
-- first stage (position 0) of its tenant. Use DISTINCT ON so tenants
-- with multiple stages at position 0 (shouldn't happen, but defend
-- against it) still resolve to a single stage.
UPDATE referrals r
   SET stage_id = s.id
  FROM (
    SELECT DISTINCT ON (tenant_id) id, tenant_id
      FROM pipeline_stages
     ORDER BY tenant_id, position ASC
  ) s
 WHERE r.stage_id IS NULL
   AND r.tenant_id IS NOT NULL
   AND s.tenant_id = r.tenant_id;
