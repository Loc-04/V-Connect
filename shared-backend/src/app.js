import cors from 'cors';
import express from 'express';
import { CORS_ORIGINS } from './config/env.js';
import apiRouter from './routes/index.js';

const app = express();

app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: false,
  })
);
app.use(express.json({ limit: '15mb' }));

// Keep both mounts so clients configured with or without `/api` base path
// resolve the same API routes.
app.use('/api', apiRouter);
app.use(apiRouter);

app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    res.status(400).json({ message: 'Malformed JSON body.' });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  res.status(500).json({ message });
});

export default app;
