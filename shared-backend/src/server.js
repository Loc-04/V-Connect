import app from './app.js';

const PORT = Number(process.env.PORT ?? 3000);

const server = app.listen(PORT);

server.on('listening', () => {
  console.log(`shared-backend listening on http://localhost:${PORT}`);
});

server.on('error', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[shared-backend] server error: ${message}`);
  process.exitCode = 1;
});

server.on('close', () => {
  console.error('[shared-backend] server closed.');
});
