import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db';

const DEFAULT_EMAIL    = 'admin@sportstock.com';
const DEFAULT_PASSWORD = 'Admin@SportStock2024';

async function main(): Promise<void> {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const { rowCount } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, email_verified)
     VALUES ($1, $2, 'Platform Admin', 'super_admin', true)
     ON CONFLICT (email) DO NOTHING`,
    [DEFAULT_EMAIL, hash]
  );

  if (rowCount && rowCount > 0) {
    console.log(`Super admin created:`);
    console.log(`  Email:    ${DEFAULT_EMAIL}`);
    console.log(`  Password: ${DEFAULT_PASSWORD}`);
    console.log('\nIMPORTANT: Change the password immediately after first login!');
  } else {
    console.log(`Super admin already exists (${DEFAULT_EMAIL}) — no changes made.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
