import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../app.js';

async function fixture(fn) {
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'travel-test-'));
 let server;
 const start=async()=>{server=createApp({dataDir}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return `http://127.0.0.1:${server.address().port}`;};
 const stop=async()=>{if(server)await new Promise((r,j)=>server.close(e=>e?j(e):r()));};
 try { await fn({dataDir,start,stop}); } finally {await stop();await rm(dataDir,{recursive:true,force:true});}
}
test('health and sample API return data without exposing server environment',async()=>fixture(async({start})=>{
 process.env.GOOGLE_MAPS_SERVER_API_KEY='server-secret-test-value';
 const url=await start();
 const health=await fetch(url+'/api/health');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok',stage:1});
 const response=await fetch(url+'/api/itinerary');assert.equal(response.status,200);
 const text=await response.text();assert.ok(!text.includes('server-secret-test-value'));
 const trip=JSON.parse(text);assert.equal(trip.days.length,3);assert.equal(trip.days[0].places.length,5);
 for(const d of trip.days){assert.deepEqual(d.places.map(p=>p.time),d.places.map(p=>p.time).sort());for(const p of d.places){assert.ok(Number.isFinite(p.lat)&&Number.isFinite(p.lng));}}
 delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
}));
test('existing JSON survives a real server restart without reseeding',async()=>fixture(async({start,stop,dataDir})=>{
 let url=await start();await fetch(url+'/api/itinerary');
 const file=path.join(dataDir,'itinerary.json');const trip=JSON.parse(await readFile(file,'utf8'));trip.title='보존해야 할 내 여행';await writeFile(file,JSON.stringify(trip));
 await stop();url=await start();
 assert.equal((await (await fetch(url+'/api/itinerary')).json()).title,'보존해야 할 내 여행');
}));
test('malformed persisted JSON returns a controlled error and never overwrites data',async()=>fixture(async({start,dataDir})=>{
 const url=await start();const file=path.join(dataDir,'itinerary.json');await writeFile(file,'invalid-json');
 const response=await fetch(url+'/api/itinerary');assert.equal(response.status,500);assert.ok((await response.json()).error);assert.equal(await readFile(file,'utf8'),'invalid-json');
}));
test('sample Excel download is an xlsx archive and unknown APIs return JSON 404',async()=>fixture(async({start})=>{
 const url=await start();const response=await fetch(url+'/api/sample');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/itinerary.xlsx/);const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(String.fromCharCode(...bytes.slice(0,2)),'PK');
 const missing=await fetch(url+'/api/missing');assert.equal(missing.status,404);assert.ok((await missing.json()).error);
}));
