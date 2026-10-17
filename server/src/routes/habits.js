import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(Date.parse(s));
const needDay = (value, res) => {
  if (isDay(value)) return true;
  res.status(400).json({ error: 'Expected a date in YYYY-MM-DD format.' });
  return false;
};

const STREAKS = `
  WITH numbered AS (
    SELECT habit_id, day,
           day - (ROW_NUMBER() OVER (PARTITION BY habit_id ORDER BY day))::int AS grp
    FROM check_ins
    WHERE habit_id = ANY($1)
  ),
  runs AS (
    SELECT habit_id, MAX(day) AS end_day, COUNT(*)::int AS len
    FROM numbered GROUP BY habit_id, grp
  )
  SELECT habit_id,
         MAX(len) AS longest,
         COALESCE(MAX(len) FILTER (WHERE end_day >= $2::date - 1), 0) AS current
  FROM runs GROUP BY habit_id`;

router.get('/habits', async (req, res) => {
  const today = req.query.today;
  if (!needDay(today, res)) return;

  const { rows: habits } = await query(
    'SELECT id, name FROM habits WHERE user_id = $1 AND archived_at IS NULL ORDER BY created_at, id',
    [req.userId]);
  const ids = habits.map((h) => h.id);

  const [{ rows: streaks }, { rows: recent }] = await Promise.all([
    query(STREAKS, [ids, today]),
    query(`SELECT habit_id, day FROM check_ins
           WHERE habit_id = ANY($1) AND day > $2::date - 30 AND day <= $2::date`, [ids, today]),
  ]);

  const streakBy = Object.fromEntries(streaks.map((s) => [s.habit_id, s]));
  const cut = new Date(today + 'T00:00:00Z');
  cut.setUTCDate(cut.getUTCDate() - 7);
  const cutoff = cut.toISOString().slice(0, 10);

  res.json(habits.map((h) => {
    const days = recent.filter((r) => r.habit_id === h.id).map((r) => r.day);
    return {
      ...h,
      current: streakBy[h.id]?.current ?? 0,
      longest: streakBy[h.id]?.longest ?? 0,
      rate30: Math.round((days.length / 30) * 100),
      recent: days.filter((d) => d > cutoff),
    };
  }));
});

router.post('/habits', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name || name.length > 80) return res.status(400).json({ error: 'Give the habit a name up to 80 characters.' });
  const { rows: [h] } = await query(
    'INSERT INTO habits (user_id, name) VALUES ($1, $2) RETURNING id, name', [req.userId, name]);
  res.status(201).json(h);
});

router.delete('/habits/:id', async (req, res) => {
  await query('UPDATE habits SET archived_at = now() WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.status(204).end();
});

const owns = async (habitId, userId) =>
  (await query('SELECT 1 FROM habits WHERE id = $1 AND user_id = $2 AND archived_at IS NULL', [habitId, userId])).rowCount > 0;

router.put('/habits/:id/checkins/:day', async (req, res) => {
  if (!needDay(req.params.day, res)) return;
  if (!(await owns(req.params.id, req.userId))) return res.status(404).json({ error: 'Habit not found.' });
  await query('INSERT INTO check_ins (habit_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.id, req.params.day]);
  res.status(204).end();
});

router.delete('/habits/:id/checkins/:day', async (req, res) => {
  if (!needDay(req.params.day, res)) return;
  if (!(await owns(req.params.id, req.userId))) return res.status(404).json({ error: 'Habit not found.' });
  await query('DELETE FROM check_ins WHERE habit_id = $1 AND day = $2', [req.params.id, req.params.day]);
  res.status(204).end();
});

router.get('/stats', async (req, res) => {
  const today = req.query.today;
  if (!needDay(today, res)) return;

  const heatmap = query(`
    SELECT d::date AS day, COUNT(c.id)::int AS count
    FROM generate_series($2::date - 181, $2::date, '1 day') AS d
    LEFT JOIN (check_ins c JOIN habits h ON h.id = c.habit_id AND h.user_id = $1 AND h.archived_at IS NULL)
      ON c.day = d::date
    GROUP BY d ORDER BY d`, [req.userId, today]);

  const weekly = query(`
    WITH weeks AS (
      SELECT DISTINCT date_trunc('week', d)::date AS week
      FROM generate_series($2::date - 55, $2::date, '1 day') AS d
    )
    SELECT w.week AS week, COUNT(c.id)::int AS done
    FROM weeks w
    LEFT JOIN (check_ins c JOIN habits h ON h.id = c.habit_id AND h.user_id = $1 AND h.archived_at IS NULL)
      ON date_trunc('week', c.day)::date = w.week AND c.day <= $2::date
    GROUP BY w.week ORDER BY w.week`, [req.userId, today]);

  const count = query('SELECT COUNT(*)::int AS n FROM habits WHERE user_id = $1 AND archived_at IS NULL', [req.userId]);

  const [h, w, c] = await Promise.all([heatmap, weekly, count]);
  res.json({ heatmap: h.rows, weekly: w.rows, habitCount: c.rows[0].n });
});

export default router;
