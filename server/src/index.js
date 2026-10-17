import 'express-async-errors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import habitRoutes from './routes/habits.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api', habitRoutes);

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
app.use(express.static(dist));
app.get(/^\/(?!api).*/, (req, res, next) =>
  res.sendFile(path.join(dist, 'index.html'), (err) => err && next()));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API listening on :${port}`));
