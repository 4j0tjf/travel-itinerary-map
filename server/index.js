import dotenv from 'dotenv';
import path from 'node:path';
import { root } from './services/store.js';
import { createApp } from './app.js';
dotenv.config({ path: path.join(root, '.env') });
const port = Number(process.env.PORT || 6001);
const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');
createApp({ dataDir }).listen(port, '0.0.0.0', () => console.log(`Travel API: http://localhost:${port}`));
