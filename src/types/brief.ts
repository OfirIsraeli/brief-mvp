export interface Brief {
  id: string;
  name: string;
  artists: string[];
  genres: string[];
  venues: string[];
  schedule: {
    dayOfWeek: string;
    time: string;
    eventWindow: string; // e.g., "weekend", "next 7 days"
  };
  deliveryMethod: 'whatsapp' | 'email';
  deliveryContact: string;
  createdAt: Date;
  isActive: boolean;
}

export interface OnboardingData {
  step: number;
  artists: string[];
  genres: string[];
  venues: string[];
  schedule: {
    dayOfWeek: string;
    time: string;
    eventWindow: string;
  };
  deliveryMethod: 'whatsapp' | 'email';
  deliveryContact: string;
}

export const VENUES = [
  { id: 'barby', name: 'Barby', category: 'Music Venue' },
  { id: 'teder', name: 'Teder.fm', category: 'Music Venue' },
  { id: 'levontin7', name: 'Levontin 7', category: 'Music Venue' },
  { id: 'kuli-alma', name: 'Kuli Alma', category: 'Club' },
  { id: 'ozen-bar', name: 'Ozen Bar', category: 'Music Venue' },
  { id: 'suzanne-dellal', name: 'Suzanne Dellal', category: 'Theatre' },
  { id: 'liebling-haus', name: 'Liebling Haus', category: 'Gallery' },
  { id: 'artport', name: 'Artport Tel Aviv', category: 'Gallery' },
  { id: 'secret-telaviv', name: 'Secret Tel Aviv', category: 'Events' },
  { id: 'go-out', name: 'Go Out', category: 'Ticketing' },
  { id: 'eventim', name: 'Eventim', category: 'Ticketing' },
  { id: 'ticketmaster', name: 'Ticketmaster IL', category: 'Ticketing' },
];

export const GENRES = [
  'Indie Rock',
  'Jazz',
  'Electronic',
  'Hip Hop',
  'Classical',
  'World Music',
  'Pop',
  'R&B',
  'Alternative',
  'Folk',
  'Punk',
  'Metal',
];

export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const EVENT_WINDOWS = [
  'This weekend',
  'Next 7 days',
  'Next 2 weeks',
  'This month',
];
