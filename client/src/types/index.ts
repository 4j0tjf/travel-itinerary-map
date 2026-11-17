export interface Place {
 id: string; time: string; endTime: string; name: string; nameJa: string;
 category: string; address: string; lat: number; lng: number;
 memo: string; image: string; mode: 'DRIVE' | 'WALK';
}
export interface Day { date: string; title: string; description: string; places: Place[] }
export interface Itinerary { id: string; title: string; subtitle: string; country: string; region: string; days: Day[] }
