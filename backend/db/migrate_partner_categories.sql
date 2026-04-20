-- Partner categories (admin-customizable, drives the "Type de partenariat"
-- radio cards in the public apply flow).
CREATE TABLE IF NOT EXISTS partner_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  color VARCHAR(7) DEFAULT '#6B7280',
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_partner_categories_tenant ON partner_categories(tenant_id, position);

ALTER TABLE partners ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES partner_categories(id);

-- Seed the 3 defaults for every existing tenant. Idempotent via the
-- UNIQUE (tenant_id, slug) constraint.
INSERT INTO partner_categories (tenant_id, name, slug, color, description, is_default, position)
SELECT t.id, "Apporteur d''affaires", 'apporteur', '#059669', 'Je recommande des prospects à l''entreprise', TRUE, 0 FROM tenants t
ON CONFLICT (tenant_id, slug) DO NOTHING;

INSERT INTO partner_categories (tenant_id, name, slug, color, description, is_default, position)
SELECT t.id, 'Partenaire conseil', 'conseil', '#3B82F6', 'Je conseille et accompagne les clients dans leur choix', FALSE, 1 FROM tenants t
ON CONFLICT (tenant_id, slug) DO NOTHING;

INSERT INTO partner_categories (tenant_id, name, slug, color, description, is_default, position)
SELECT t.id, 'Partenaire intégrateur', 'integrateur', '#8B5CF6', 'J''intègre et déploie la solution chez mes clients', FALSE, 2 FROM tenants t
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Backfill every existing partner to its tenant's default category.
UPDATE partners p
   SET category_id = (
     SELECT pc.id FROM partner_categories pc
      WHERE pc.tenant_id = p.tenant_id AND pc.is_default = TRUE
      LIMIT 1
   )
 WHERE p.category_id IS NULL;
