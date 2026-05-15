const router = require('express').Router();
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

// Onboarding checklist. Status is computed live from tenant config +
// related tables on every read — the only persisted state is the
// admin's "Ne plus afficher" dismiss flag and a one-time
// completion timestamp the GET handler writes when percentage hits
// 100%, so the popup never resurrects after the admin actually
// finishes the setup.
//
// Steps are deliberately mapped to existing columns/tables (rather
// than the spec's hypothetical program_name / qonto_api_key / etc.)
// so the checks stay truthful against this codebase:
//   billing       → tenants.billing_company_name + address + siret
//   program       → tenant_levels has at least one row (admin set
//                   tiers — name + revenue_model are auto-set on
//                   signup so they don't make a useful signal)
//   branding      → tenants.logo_url + primary_color
//   pipeline      → partner_categories has rows (pipeline_stages
//                   auto-seeds defaults on first Kanban view, so
//                   it can't be a clean signal)
//   marketplace   → marketplace_visible + short_description
//   banking       → payment_integrations row with is_active=true
//                   (Qonto OAuth completed)
//   first_partner → partners count > 0 (excluding soft-deleted)

router.get('/status', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  const tenantId = req.user.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenant_missing' });

  try {
    const [tenantR, partnersR, levelsR, categoriesR, paymentR] = await Promise.all([
      query('SELECT * FROM tenants WHERE id = $1', [tenantId]),
      query('SELECT COUNT(*)::int AS c FROM partners WHERE tenant_id = $1 AND deleted_at IS NULL', [tenantId]),
      query('SELECT COUNT(*)::int AS c FROM tenant_levels WHERE tenant_id = $1', [tenantId]),
      query('SELECT COUNT(*)::int AS c FROM partner_categories WHERE tenant_id = $1', [tenantId])
        .catch(() => ({ rows: [{ c: 0 }] })),
      query('SELECT 1 FROM payment_integrations WHERE tenant_id = $1 AND is_active = TRUE LIMIT 1', [tenantId])
        .catch(() => ({ rows: [] })),
    ]);

    const t = tenantR.rows[0];
    if (!t) return res.status(404).json({ error: 'tenant_not_found' });

    const steps = [
      {
        id: 'billing',
        completed: !!(t.billing_company_name && t.billing_address && t.billing_siret),
        link: '/settings?tab=company',
        order: 1,
      },
      {
        id: 'program',
        completed: levelsR.rows[0].c > 0,
        link: '/programme',
        order: 2,
      },
      {
        id: 'branding',
        // Any single signal of customisation is enough — most admins
        // never upload a logo (no asset ready, design done elsewhere)
        // so a logo-required gate stranded the step at "incomplete"
        // even when the admin had customised both colours. We accept:
        //   - logo_url set, OR
        //   - primary_color set and != signup default #6366f1, OR
        //   - accent_color  set and != signup default #f97316, OR
        //   - secondary_color set and != signup default #0f172a.
        // revenue_model is excluded — its default is 'CA' and the
        // signup flow doesn't force a choice, so it's not a reliable
        // signal of intent.
        completed: !!(
          (t.logo_url && String(t.logo_url).trim()) ||
          (t.primary_color   && String(t.primary_color).toLowerCase()   !== '#6366f1') ||
          (t.accent_color    && String(t.accent_color).toLowerCase()    !== '#f97316') ||
          (t.secondary_color && String(t.secondary_color).toLowerCase() !== '#0f172a')
        ),
        link: '/settings?tab=branding',
        order: 3,
      },
      {
        id: 'pipeline',
        completed: categoriesR.rows[0].c > 0,
        link: '/settings?tab=pipeline',
        order: 4,
      },
      {
        id: 'marketplace',
        completed: !!(t.marketplace_visible && t.short_description),
        link: '/marketplace-admin',
        order: 5,
      },
      {
        id: 'banking',
        completed: paymentR.rows.length > 0,
        link: '/settings?tab=integrations',
        order: 6,
      },
      {
        id: 'first_partner',
        completed: partnersR.rows[0].c > 0,
        link: '/partners',
        order: 7,
      },
    ];

    const completedCount = steps.filter(s => s.completed).length;
    const totalCount = steps.length;
    const percentage = Math.round((completedCount / totalCount) * 100);

    // Sticky "completed" timestamp. Once everything is checked off
    // we write the timestamp once so the sidebar can drop the
    // Progression entry from then on (we expose `completedAt` for
    // the FE to gate on).
    if (percentage === 100 && !t.onboarding_completed_at) {
      try {
        await query('UPDATE tenants SET onboarding_completed_at = NOW() WHERE id = $1', [tenantId]);
        t.onboarding_completed_at = new Date().toISOString();
      } catch (err) {
        console.error('[onboarding.status] mark-complete failed:', err.message);
      }
    }

    res.json({
      steps,
      completedCount,
      totalCount,
      percentage,
      allCompleted: percentage === 100,
      dismissed: !!t.onboarding_dismissed,
      completedAt: t.onboarding_completed_at,
    });
  } catch (err) {
    console.error('[onboarding.status]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/dismiss', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  const tenantId = req.user.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenant_missing' });
  try {
    await query('UPDATE tenants SET onboarding_dismissed = TRUE WHERE id = $1', [tenantId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[onboarding.dismiss]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
