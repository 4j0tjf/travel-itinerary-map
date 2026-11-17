import { mkdir, readFile, copyFile, constants } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export async function loadItinerary(dataDir) {
 await mkdir(dataDir, { recursive: true });
 const target = path.join(dataDir, 'itinerary.json');
 try { await copyFile(path.join(root, 'sample/itinerary.json'), target, constants.COPYFILE_EXCL); }
 catch (error) { if (error.code !== 'EEXIST') throw error; }
 const data = JSON.parse(await readFile(target, 'utf8'));
 if (!data.id || !Array.isArray(data.days)) throw new Error('저장된 일정의 형식이 올바르지 않습니다.');
 return data;
}
