const { query } = require('../db');

// Called whenever a new tenant is created so they land with the three
// default partnership types already present. Idempotent — the
// UNIQUE (tenant_id, slug) index makes re-runs a no-op.
const DEFAULTS = [
  { slug: 'apporteur',   name: "Apporteur d'affaires",   color: '#059669', description: "Je recommande des prospects à l'entreprise",            position: 0, is_default: true  },
  { slug: 'conseil',     name: 'Partenaire conseil',     color: '#3B82F6', description: 'Je conseille et accompagne les clients dans leur choix', position: 1, is_default: false },
  { slug: 'integrateur', name: 'Partenaire intégrateur', color: '#8B5CF6', description: "J'intègre et déploie la solution chez mes clients",      position: 2, is_default: false },
];

async function seedDefaultCategories(tenantId) {
  if (!tenantId) return;
  for (const d of DEFAULTS) {
    try {
      await query(
        `INSERT INTO partner_categories (tenant_id, name, slug, color, description, is_default, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, slug) DO NOTHING`,
        [tenantId, d.name, d.slug, d.color, d.description, d.is_default, d.position]
      );
    } catch (err) {
      console.error('[partnerCategoriesSeed]', err.message);
    }
  }
}

module.exports = { seedDefaultCategories, DEFAULTS };
