import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(s + 'T00:00:00');
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const short = (s) => parse(s).toLocaleDateString('en', { month: 'short', day: 'numeric' });

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  return authed
    ? <Dashboard onLogout={() => { setToken(null); setAuthed(false); }} />
    : <Auth onDone={() => setAuthed(true)} />;
}

function Auth({ onDone }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const { token } = await api(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: { email, password } });
      setToken(token);
      onDone();
    } catch (err) { setError(err.message); }
  }

  return (
    <main className="wrap narrow">
      <h1 className="brand">Stamp</h1>
      <p className="lede">Mark each day you keep a habit. Streaks and trends build up on their own.</p>
      <form onSubmit={submit} className="auth">
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
        {mode === 'login' && <button type="button" className="link" onClick={() => { setEmail('demo@example.com'); setPassword('demo1234'); }}>Fill in the demo account</button>}
      </form>
    </main>
  );
}

function Dashboard({ onLogout }) {
  const today = fmt(new Date());
  const [habits, setHabits] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try {
      const [h, s] = await Promise.all([api(`/habits?today=${today}`), api(`/stats?today=${today}`)]);
      setHabits(h); setStats(s);
    } catch (e) { setError(e.message); }
  }, [today]);
  useEffect(() => { load(); }, [load]);

  async function toggle(habit, day) {
    const on = habit.recent.includes(day);
    setHabits((hs) => hs.map((x) => x.id === habit.id
      ? { ...x, recent: on ? x.recent.filter((d) => d !== day) : [...x.recent, day] } : x));
    try {
      await api(`/habits/${habit.id}/checkins/${day}`, { method: on ? 'DELETE' : 'PUT' });
    } catch (e) { setError(e.message); }
    load();
  }

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try { await api('/habits', { method: 'POST', body: { name } }); setName(''); load(); }
    catch (err) { setError(err.message); }
  }

  async function remove(habit) {
    if (!confirm(`Archive “${habit.name}”? Its history stays in the database but leaves your charts.`)) return;
    await api(`/habits/${habit.id}`, { method: 'DELETE' });
    load();
  }

  const total = stats?.heatmap.reduce((n, d) => n + d.count, 0) ?? 0;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  return (
    <main className="wrap">
      <header className="top">
        <h1 className="brand">Stamp</h1>
        <button className="link" onClick={onLogout}>Sign out</button>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      <section aria-labelledby="h-year">
        <h2 id="h-year" className="big">{stats ? total : '…'} stamps in the last 26 weeks</h2>
        {stats && <Heatmap days={stats.heatmap} habitCount={stats.habitCount} />}
      </section>

      <section aria-labelledby="h-habits">
        <h2 id="h-habits">Today and the last 6 days</h2>
        {habits?.length === 0 && <p className="empty">No habits yet. Add your first one below.</p>}
        <ul className="habits">
          {habits?.map((h) => (
            <li key={h.id} className="habit">
              <div className="info">
                <strong>{h.name}</strong>
                <span className="meta">
                  <span className={h.current > 0 ? 'streak on' : 'streak'}>{h.current}-day streak</span>
                  <span>best {h.longest}</span>
                  <span>{h.rate30}% of last 30 days</span>
                </span>
              </div>
              <div className="stamps">
                {week.map((d) => (
                  <button key={d} className={'stamp' + (h.recent.includes(d) ? ' on' : '') + (d === today ? ' today' : '')}
                    aria-pressed={h.recent.includes(d)}
                    aria-label={`${h.name}, ${short(d)}${d === today ? ' (today)' : ''}`}
                    title={short(d)} onClick={() => toggle(h, d)}>
                    <span className="dow">{parse(d).toLocaleDateString('en', { weekday: 'short' })}</span>
                  </button>
                ))}
              </div>
              <button className="link small" onClick={() => remove(h)} aria-label={`Archive ${h.name}`}>Archive</button>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="add">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New habit, like “Stretch for 10 minutes”" maxLength={80} aria-label="New habit name" />
          <button className="primary">Add habit</button>
        </form>
      </section>

      {stats && stats.habitCount > 0 && (
        <section aria-labelledby="h-weeks">
          <h2 id="h-weeks">Stamps per week</h2>
          <WeeklyBars weeks={stats.weekly} habitCount={stats.habitCount} />
        </section>
      )}
    </main>
  );
}

function Heatmap({ days, habitCount }) {
  const offset = parse(days[0].day).getDay();
  const cols = Math.ceil((days.length + offset) / 7);
  const cell = 14, gap = 4, step = cell + gap;
  const level = (c) => (c === 0 ? 0 : Math.min(4, Math.ceil((4 * c) / Math.max(habitCount, 1))));
  return (
    <div className="scroll">
      <svg viewBox={`0 0 ${cols * step} ${7 * step}`} className="heat" role="img"
        aria-label="Heatmap of stamps per day over the last 26 weeks">
        {days.map((d, i) => {
          const idx = i + offset;
          return (
            <rect key={d.day} x={Math.floor(idx / 7) * step} y={(idx % 7) * step} width={cell} height={cell} rx="3"
              className={'l' + level(d.count)}>
              <title>{`${short(d.day)}: ${d.count} of ${habitCount} habits`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

function WeeklyBars({ weeks, habitCount }) {
  const max = habitCount * 7;
  return (
    <ol className="bars">
      {weeks.map((w) => (
        <li key={w.week}>
          <div className="bar" style={{ height: `${Math.max(3, (w.done / max) * 100)}%` }} title={`${w.done} of ${max}`} />
          <span className="n">{w.done}</span>
          <span className="wk">{short(w.week)}</span>
        </li>
      ))}
    </ol>
  );
}
