import bcrypt from 'bcryptjs';
import { pool, query } from './db.js';

const habits = [
  ['Read 20 pages', 0.8],
  ['Run 3 km', 0.5],
  ['Meditate', 0.7],
  ['Write in journal', 0.6],
  ['No sugar', 0.35],
];

await query("DELETE FROM users WHERE email = 'demo@example.com'");
const hash = await bcrypt.hash('demo1234', 10);
const { rows: [user] } = await query(
  "INSERT INTO users (email, password_hash) VALUES ('demo@example.com', $1) RETURNING id", [hash]);

const today = new Date();
for (const [i, [name, p]] of habits.entries()) {
  const { rows: [h] } = await query(
    'INSERT INTO habits (user_id, name) VALUES ($1, $2) RETURNING id', [user.id, name]);
  const days = [];
  for (let back = 0; back < 180; back++) {
    if ((i === 0 && back < 12) || Math.random() < p) {
      const d = new Date(today); d.setDate(d.getDate() - back);
      days.push(d.toISOString().slice(0, 10));
    }
  }
  await query(
    'INSERT INTO check_ins (habit_id, day) SELECT $1, unnest($2::date[]) ON CONFLICT DO NOTHING',
    [h.id, days]);
}
console.log('Seeded demo@example.com / demo1234');
await pool.end();
