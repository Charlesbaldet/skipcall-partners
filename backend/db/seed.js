require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./index');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── Create admin user ───
    const adminHash = await bcrypt.hash('skipcall2026!', 12);
    const { rows: [admin] } = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (email) DO UPDATE SET password_hash = $2
       RETURNING id`,
      ['admin@skipcall.com', adminHash, 'Admin Skipcall', 'admin']
    );

    // ─── Create commercial user ───
    const comHash = await bcrypt.hash('commercial2026!', 12);
    const { rows: [commercial] } = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (email) DO UPDATE SET password_hash = $2
       RETURNING id`,
      ['commercial@skipcall.com', comHash, 'Thomas Roche', 'commercial']
    );

    // ─── Create partners ───
    const partnersData = [
      { name: 'TechAlliance', contact: 'Marc Dupont', email: 'marc@techalliance.fr', commission: 10 },
      { name: 'DigiConseil', contact: 'Sophie Martin', email: 'sophie@digiconseil.fr', commission: 12 },
      { name: 'CloudExperts', contact: 'Julien Petit', email: 'julien@cloudexperts.io', commission: 8 },
    ];

    const partnerIds = [];
    for (const p of partnersData) {
      const partnerHash = await bcrypt.hash('partner2026!', 12);
      const { rows: [partner] } = await client.query(
        `INSERT INTO partners (name, contact_name, email, commission_rate) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (email) DO UPDATE SET name = $1
         RETURNING id`,
        [p.name, p.contact, p.email, p.commission]
      );
      partnerIds.push(partner.id);

      // Create partner user account
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, partner_id) 
         VALUES ($1, $2, $3, 'partner', $4) 
         ON CONFLICT (email) DO UPDATE SET partner_id = $4`,
        [p.email, partnerHash, p.contact, partner.id]
      );
    }

    // ─── Create sample referrals ───
    const referralsData = [
      { partner: 0, prospect: 'Acme Corp', email: 'contact@acme.fr', phone: '+33 6 12 34 56 78', company: 'Acme Corp', role: 'Directeur IT', level: 'hot', status: 'won', value: 24000, notes: 'Très intéressé, besoin urgent.' },
      { partner: 1, prospect: 'BioTech Solutions', email: 'dir@biotech.fr', phone: '+33 1 45 67 89 01', company: 'BioTech Solutions', role: 'CEO', level: 'warm', status: 'meeting', value: 18000, notes: 'Croissance rapide, 50 employés.' },
      { partner: 0, prospect: 'LogiPro', email: 'info@logipro.com', phone: '+33 4 56 78 90 12', company: 'LogiPro', role: 'Responsable Ops', level: 'cold', status: 'new', value: 0, notes: 'Compare avec la concurrence.' },
      { partner: 2, prospect: 'FinanceFirst', email: 'tech@financefirst.fr', phone: '+33 6 98 76 54 32', company: 'FinanceFirst', role: 'CTO', level: 'hot', status: 'proposal', value: 36000, notes: 'Budget validé, démo planifiée.' },
      { partner: 1, prospect: 'MediaPlus', email: 'rh@mediaplus.fr', phone: '+33 1 23 45 67 89', company: 'MediaPlus', role: 'DRH', level: 'warm', status: 'lost', value: 42000, notes: 'Service client, 120 agents.' },
      { partner: 2, prospect: 'GreenEnergy SA', email: 'it@greenenergy.fr', phone: '+33 6 11 22 33 44', company: 'GreenEnergy SA', role: 'DSI', level: 'hot', status: 'won', value: 58000, notes: 'Migration cloud, 200 postes.' },
    ];

    for (const r of referralsData) {
      const { rows: [referral] } = await client.query(
        `INSERT INTO referrals (partner_id, submitted_by, prospect_name, prospect_email, prospect_phone, prospect_company, prospect_role, recommendation_level, notes, status, deal_value, assigned_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [partnerIds[r.partner], admin.id, r.prospect, r.email, r.phone, r.company, r.role, r.level, r.notes, r.status, r.value, commercial.id]
      );

      // Create commission for won deals
      if (r.status === 'won') {
        const rate = partnersData[r.partner].commission;
        await client.query(
          `INSERT INTO commissions (referral_id, partner_id, amount, rate, deal_value, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [referral.id, partnerIds[r.partner], r.value * rate / 100, rate, r.value]
        );
      }
    }

    await client.query('COMMIT');
    console.log('✅ Database seeded successfully');
    console.log('');
    console.log('📋 Test accounts:');
    console.log('   Admin:      admin@skipcall.com / skipcall2026!');
    console.log('   Commercial: commercial@skipcall.com / commercial2026!');
    console.log('   Partners:   marc@techalliance.fr / partner2026!');
    console.log('               sophie@digiconseil.fr / partner2026!');
    console.log('               julien@cloudexperts.io / partner2026!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
