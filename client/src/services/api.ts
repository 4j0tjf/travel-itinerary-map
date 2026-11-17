import type { Itinerary } from '../types';
export async function getItinerary(signal?: AbortSignal): Promise<Itinerary> {
 const response = await fetch('/api/itinerary', { signal });
 if (!response.ok) throw new Error('일정을 불러오지 못했습니다. 서버 연결을 확인해 주세요.');
 return response.json();
}
