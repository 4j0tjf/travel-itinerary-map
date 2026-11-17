import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadItinerary, root } from './services/store.js';
export function createApp({ dataDir = path.join(root, 'data') } = {}) {
 const app = express();
 app.disable('x-powered-by');
 app.get('/api/health', (_req, res) => res.json({ status: 'ok', stage: 1 }));
 app.get('/api/itinerary', async (_req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json(await loadItinerary(dataDir)); }
  catch (error) { next(error); }
 });
 app.get('/api/sample', (_req,res) => res.download(path.join(root, 'sample/itinerary.xlsx'), 'itinerary.xlsx'));
 app.use('/api', (_req,res) => res.status(404).json({ error: '지원하지 않는 API입니다.' }));
 const dist = path.join(root, 'client/dist');
 if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*path}', (_req,res) => res.sendFile(path.join(dist,'index.html')));
 }
 app.use((error, _req,res,_next) => {
  console.error('Request failed:', error.message);
  res.status(500).json({ error: '서버에서 일정을 읽지 못했습니다. 저장 파일을 확인해 주세요.' });
 });
 return app;
}
