import { useEffect, useRef, useState } from 'react';
import { Plus, Minus, LocateFixed, Mountain, Layers, MapPin, ExternalLink, Navigation } from 'lucide-react';
import type { Day, Place } from '../types';

const project = (p: Place) => ({ x: (p.lng - 138.64) / .19 * 1000, y: (35.56 - p.lat) / .1 * 850 });
let mapsPromise: Promise<void> | undefined;
function loadMaps(key: string) {
 if (window.google?.maps) return Promise.resolve();
 if (!mapsPromise) mapsPromise = new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=ko&region=JP&loading=async&callback=__travelMapsReady`;
  const timeout = window.setTimeout(() => reject(new Error('지도를 불러오는 시간이 초과되었습니다.')), 20000);
  (window as unknown as Record<string, unknown>).__travelMapsReady = () => { clearTimeout(timeout); resolve(); };
  script.onerror = () => { clearTimeout(timeout); reject(new Error('Google Maps 연결을 확인해 주세요.')); };
  document.head.appendChild(script);
 });
 return mapsPromise;
}
const apiKey = (import.meta as unknown as {env: Record<string,string>}).env.VITE_GOOGLE_MAPS_API_KEY;

export default function TravelMap({ day, selectedId, onSelect, onSettings, routeVisible }: {day: Day; selectedId: string; onSelect: (id: string) => void; onSettings: () => void; routeVisible: boolean}) {
 const container = useRef<HTMLDivElement>(null);
 const map = useRef<google.maps.Map | null>(null);
 const markers = useRef<google.maps.Marker[]>([]);
 const info = useRef<google.maps.InfoWindow | null>(null);
 const [mapReady, setMapReady] = useState(false);
 const [error, setError] = useState('');
 const [zoom, setZoom] = useState(1);
 const [aspect,setAspect]=useState(1.3);
 const [pan, setPan] = useState({x:0,y:0});
 const [terrain, setTerrain] = useState(true);
 const drag = useRef<{x:number;y:number;px:number;py:number} | null>(null);
 const svg = useRef<SVGSVGElement>(null);
 const previousSelection = useRef({day: day.date, id: selectedId});
 const selected = day.places.find(p => p.id === selectedId);
 const points = day.places.map(project);
 const minX = Math.min(...points.map(p=>p.x)); const maxX = Math.max(...points.map(p=>p.x));
 const minY = Math.min(...points.map(p=>p.y)); const maxY = Math.max(...points.map(p=>p.y));
 const viewWidth = Math.max(maxX-minX+300,(maxY-minY+350)*aspect,550)/zoom;
 const viewHeight = viewWidth/aspect;
 const center = {x:(minX+maxX)/2,y:(minY+maxY)/2};
 const fit = () => { setZoom(1); setPan({x:0,y:0}); if (map.current) {const bounds = new google.maps.LatLngBounds();day.places.forEach(p=>bounds.extend(p));map.current.fitBounds(bounds,70);} };
 useEffect(() => { setZoom(1); setPan({x:0,y:0}); }, [day]);
 useEffect(()=>{
  if(!svg.current)return;
  const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;if(width>0&&height>0)setAspect(width/height);});
  observer.observe(svg.current);return()=>observer.disconnect();
 },[error]);
 useEffect(() => {
  const previous=previousSelection.current;
  if(previous.day===day.date && previous.id!==selectedId && selected){const pos=project(selected);setPan({x:pos.x-center.x,y:pos.y-center.y});}
  previousSelection.current={day:day.date,id:selectedId};
 },[selectedId,day]);
 useEffect(() => {
  if (!apiKey) return;
  let active = true;
  const onAuthFailure = () => setError('Google Maps 키 인증에 실패했습니다. 키, 결제 계정과 웹사이트 제한을 확인해 주세요.');
  (window as unknown as Record<string,unknown>).gm_authFailure = onAuthFailure;
  loadMaps(apiKey).then(() => {
   if (!active || !container.current) return;
   map.current = new google.maps.Map(container.current, {center:{lat:35.51,lng:138.77},zoom:12,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,zoomControl:false,styles:[{featureType:'poi',stylers:[{visibility:'off'}]}]});
   info.current = new google.maps.InfoWindow(); setMapReady(true);
  }).catch(e=>{if(active)setError(e.message);});
  return () => { active=false; markers.current.forEach(m=>m.setMap(null)); markers.current=[]; };
 }, []);
 useEffect(() => {
  if (!mapReady || !map.current) return;
  info.current?.close();
  markers.current.forEach(m=>m.setMap(null));
  const bounds = new google.maps.LatLngBounds();
  markers.current=day.places.map((p,index)=>{
   bounds.extend(p);
   const marker=new google.maps.Marker({map:map.current,position:p,title:`${index+1}. ${p.name}`,label:{text:String(index+1),color:'#fff',fontWeight:'700'},icon:{path:google.maps.SymbolPath.CIRCLE,scale:17,fillColor:'#285748',fillOpacity:1,strokeColor:'#fff',strokeWeight:3}});
   marker.addListener('click',()=>onSelect(p.id)); return marker;
  });
  map.current.fitBounds(bounds,70);
  return ()=>markers.current.forEach(m=>m.setMap(null));
 }, [day,mapReady,onSelect]);
 useEffect(()=>{
  if (!map.current || !selected || !mapReady) return;
  map.current.panTo(selected);
  const el=document.createElement('div');el.className='google-info';
  const heading=document.createElement('strong');heading.textContent=selected.name;
  const description=document.createElement('p');description.textContent=`${selected.time} · ${selected.memo}`;
  el.append(heading,description); info.current?.setContent(el);
  info.current?.open({map:map.current,anchor:markers.current[day.places.findIndex(p=>p.id===selected.id)]});
 },[selected,mapReady,day]);
 useEffect(()=>{if(map.current)map.current.setMapTypeId(terrain?'roadmap':'terrain');},[terrain]);
 const focus = (p: Place) => {onSelect(p.id);const pos=project(p);setPan({x:pos.x-center.x,y:pos.y-center.y});};
 if (!day.places.length) return <div className="map-empty"><MapPin/><p>이 날짜에는 등록된 장소가 없습니다.</p></div>;
 return <div className={`travel-map ${terrain?'':'terrain-off'}`}>
  {apiKey && !error ? <div className="google-map" ref={container}/> : <svg ref={svg} className="sample-map" viewBox={`${center.x-viewWidth/2+pan.x} ${center.y-viewHeight/2+pan.y} ${viewWidth} ${viewHeight}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="후지산 샘플 일정 지도. 번호 마커로 장소를 선택하세요." onPointerDown={e=>{if((e.target as Element).closest('[data-marker]'))return;drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!drag.current || !svg.current)return;const scale=Math.min(svg.current.clientWidth/viewWidth,svg.current.clientHeight/viewHeight);setPan({x:drag.current.px-(e.clientX-drag.current.x)/scale,y:drag.current.py-(e.clientY-drag.current.y)/scale});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
   <defs>
    <pattern id="woods" width="37" height="37" patternUnits="userSpaceOnUse"><circle cx="10" cy="13" r="1.5" fill="#b5c6a4" opacity=".28"/><circle cx="31" cy="30" r="1" fill="#b5c6a4" opacity=".2"/></pattern>
    <filter id="pin-shadow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#314f3a" floodOpacity=".2"/></filter>
   </defs>
   <rect x="-1500" y="-1500" width="4000" height="4000" fill="#e7ecdd"/>
   <g className="terrain-shapes" fill="#d9e2cc"><path d="M-100 200 Q30-60 240 30T570 50Q670 120 580 210T260 330 50 380Z"/><path d="M500 770Q310 700 300 620T190 570 70 700L0 1100H1300V580Q950 720 800 600T500 770"/><path d="M800 0H1200V470Q1050 350 1020 280T800 0"/></g>
   <rect x="-1500" y="-1500" width="4000" height="4000" fill="url(#woods)"/>
   <g fill="none" stroke="#cbd7ba" strokeWidth="1" opacity=".6" className="contours">
    {Array.from({length:10},(_,i)=><path key={i} d={`M${20+i*15} -40 Q${120+i*20} ${180+i*9} ${350+i*8} ${110+i*13} T${700+i*15} ${180+i*14}`}/>)}
    {Array.from({length:8},(_,i)=><path key={i} d={`M${120+i*15} 950 Q${250+i*15} ${580+i*12} ${510+i*17} ${680+i*12} T1100 ${700+i*13}`}/>)}
   </g>
   <g fill="#eeeede"><path d="M570 451 650 420 815 425 930 555 900 690 730 660 635 580Z"/><path d="M700 300 775 275 840 350 810 430 735 420Z"/></g>
   <g stroke="#fffdf6" strokeWidth="4" fill="none">
    <path d="M215 370Q380 460 534 451T777 435L1050 520"/><path d="M550 280Q655 255 715 290T800 360L850 600"/><path d="M665 445 678 510 725 560 780 630 825 850"/><path d="M730 420 780 470 855 485 940 585"/><path d="M675 515 795 514 940 580"/><path d="M700 560 845 548 950 628"/><path d="M746 438 720 620"/><path d="M790 440 778 630"/><path d="M827 460 813 640"/><path d="M870 475 855 665"/><path d="M645 475 920 590"/><path d="M625 580 915 650"/>
    <path d="M400 415 470 500 550 535 680 515"/><path d="M570 272 555 310 500 353 476 408"/>
   </g>
   <g fill="none" strokeLinecap="round"><path d="M-50 555Q260 474 400 495T685 554 1030 700" stroke="#d9cda8" strokeWidth="10"/><path d="M-50 555Q260 474 400 495T685 554 1030 700" stroke="#fff5d7" strokeWidth="6"/><path d="M830 850Q790 630 850 540T885 250" stroke="#d9cda8" strokeWidth="8"/><path d="M830 850Q790 630 850 540T885 250" stroke="#fff5d7" strokeWidth="5"/></g>
   <path d="M445 375Q438 347 482 335L540 330Q561 305 600 316L637 308 667 322Q699 313 715 337L736 373Q755 389 724 407L673 414 643 402 622 420 576 410 555 427 525 406 488 411Q448 408 445 375Z" fill="#b9d6d5" stroke="#a6cac9" strokeWidth="1.5"/>
   <path d="M-80 390Q0 355 86 380T204 411L177 445 95 451 17 425 -80 438Z" fill="#b9d6d5" stroke="#a6cac9"/>
   <path d="M667 321 674 414" fill="none" stroke="#fffdf6" strokeWidth="4"/>
   <g className="map-labels" textAnchor="middle" fill="#7f8976" fontSize="11"><text x="580" y="370" fill="#638f94" fontSize="15" letterSpacing="3">가와구치호</text><text x="580" y="389" fontSize="8" fill="#719b9d" letterSpacing="2">LAKE KAWAGUCHI</text><text x="750" y="583" fontSize="13" letterSpacing="2">후지요시다</text><text x="708" y="488" fontSize="11">후지카와구치코</text><text x="540" y="235" fontSize="11">미사카 산지</text><text x="315" y="595" fontSize="11">후지하코네이즈 국립공원</text><text x="90" y="415" fill="#638f94">사이호</text><text x="905" y="394" fontSize="11">시모요시다</text><text x="690" y="749" fontSize="14" letterSpacing="2">후지산 방면</text></g>
   <g fontSize="8" textAnchor="middle"><rect x="504" y="493" width="23" height="15" rx="4" fill="#faf6e7" stroke="#d4c79d"/><text x="515" y="504" fill="#a39365">139</text><rect x="873" y="573" width="21" height="15" rx="4" fill="#faf6e7" stroke="#d4c79d"/><text x="883" y="584" fill="#a39365">137</text></g>
   {routeVisible && <polyline points={points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#698e75" strokeWidth="3" strokeDasharray="5 7" strokeLinejoin="round" opacity=".8"/>}
   {day.places.map((p,i)=>{const pos=project(p);const active=p.id===selectedId;return <g key={p.id} data-marker="true" role="button" tabIndex={0} aria-label={`${i+1}. ${p.name}`} aria-pressed={active} onClick={()=>focus(p)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus(p);}}} className={`map-pin ${active?'active':''}`} transform={`translate(${pos.x} ${pos.y})`}>
    {active && <circle r="29" fill="#285748" opacity=".1"/>}<circle r={active?19:16} fill={active?'#285748':'#fff'} stroke={active?'#fff':'#416b51'} strokeWidth={active?3:2} filter="url(#pin-shadow)"/><text textAnchor="middle" y="5" fill={active?'white':'#285748'} fontSize="14" fontWeight="700">{i+1}</text>
    <rect x={i===0?-143:23} y="-13" width={i===0?119:Math.min(p.name.length*7+18,133)} height="26" rx="6" fill="#fffdf8" opacity=".96" filter="url(#pin-shadow)"/><text x={i===0?-83:32} y="4" textAnchor={i===0?'middle':'start'} fill="#424f41" fontSize="9" fontWeight="500">{p.name.length>17?p.name.slice(0,16)+'…':p.name}</text>
   </g>})}
  </svg>}
  <div className="map-location"><span className="location-dot"/><span>{apiKey&&!error?'Google Maps':'샘플 지도'}</span><span className="location-divider"/>야마나시, 일본</div>
  <div className="map-tools"><button className="icon-button" title="모든 장소 보기" aria-label="모든 장소 보기" onClick={fit}><LocateFixed size={19}/></button><div className="zoom-group"><button className="icon-button" aria-label="지도 확대" onClick={()=>{setZoom(z=>Math.min(z+.25,2.5));if(map.current)map.current.setZoom((map.current.getZoom()||12)+1);}}><Plus size={20}/></button><span/><button className="icon-button" aria-label="지도 축소" onClick={()=>{setZoom(z=>Math.max(z-.25,.65));if(map.current)map.current.setZoom((map.current.getZoom()||12)-1);}}><Minus size={20}/></button></div><button className={`icon-button ${!terrain?'tool-active':''}`} aria-label="지도 스타일 전환" title="지도 스타일 전환" onClick={()=>setTerrain(v=>!v)}><Layers size={19}/></button></div>
  {selected && <div className="map-place-preview"><div className="preview-icon"><Mountain size={23}/></div><div><span>지금 살펴보는 장소</span><strong>{selected.name}</strong></div><button aria-label="선택한 장소를 Google Maps에서 열기" title="Google Maps에서 열기" onClick={()=>window.open(`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`,'_blank','noopener,noreferrer')}><ExternalLink size={17}/></button></div>}
  <div className="map-bottom"><button className="map-mode" onClick={onSettings}><span className="status-dot"/>{apiKey&&!error?'Google Maps 연결됨':'샘플 미리보기'}<span className="mode-link">{apiKey&&!error?'설정':'API 연결'}<Navigation size={11}/></span></button><span className="map-disclaimer">{error||(!apiKey?'실제 지도가 아닌 위치 기반 샘플입니다':'© Google Maps')}</span></div>
 </div>;
}
