// Run: node backend/db/run-migration-v2.js
// Uses the pg library already installed in backend

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || process.argv[2];

if (!DATABASE_URL) {
  console.error('❌ Usage: DATABASE_URL=... node backend/db/run-migration-v2.js');
  console.error('   or:   node backend/db/run-migration-v2.js "postgresql://..."');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const statements = [
  // 1. IBAN fields on partners
  `ALTER TABLE partners ADD COLUMN IF NOT EXISTS iban VARCHAR(34)`,
  `ALTER TABLE partners ADD COLUMN IF NOT EXISTS bic VARCHAR(11)`,
  `ALTER TABLE partners ADD COLUMN IF NOT EXISTS account_holder VARCHAR(255)`,

  // 2. Payment tracking on commissions
  `ALTER TABLE commissions ADD COLUMN IF NOT EXISTS payment_due_date DATE`,
  `ALTER TABLE commissions ADD COLUMN IF NOT EXISTS mollie_payment_id VARCHAR(255)`,
  `ALTER TABLE commissions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`,

  // 3. Engagement on referrals
  `ALTER TABLE referrals ADD COLUMN IF NOT EXISTS engagement VARCHAR(20) DEFAULT 'monthly'`,

  // 4. Conversations table
  `CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject VARCHAR(500) NOT NULL,
    partner_id UUID REFERENCES partners(id),
    created_by UUID NOT NULL REFERENCES users(id),
    is_archived BOOLEAN DEFAULT false,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 5. Messages table
  `CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 6. Conversation participants
  `CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
  )`,

  // 7. Indexes
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON conversation_participants(conversation_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_partner ON conversations(partner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC)`,
];

async function migrate() {
  console.log('🚀 Running migration v2...\n');

  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    const label = sql.trim().substring(0, 60).replace(/\s+/g, ' ');
    try {
      await pool.query(sql);
      console.log(`  ✅ ${i + 1}/${statements.length} — ${label}...`);
    } catch (err) {
      console.error(`  ❌ ${i + 1}/${statements.length} — ${label}...`);
      console.error(`     ${err.message}`);
    }
  }

  console.log('\n✅ Migration v2 terminée !');

  // Verify
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  console.log('\n📋 Tables actuelles :');
  rows.forEach(r => console.log(`   - ${r.table_name}`));

  await pool.end();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
