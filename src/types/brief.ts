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
  // Music Venues
  { id: 'barby', name: 'Barby', category: 'Music Venue', url: 'https://barby.co.il' },
  { id: 'teder', name: 'Teder.fm / Romano', category: 'Music Venue', url: 'https://teder.fm' },
  { id: 'levontin7', name: 'Levontin 7', category: 'Music Venue', url: 'https://levontin7.com' },
  { id: 'ozen-bar', name: 'Ozen Bar', category: 'Music Venue', url: 'https://ozen.co.il' },
  // Clubs
  { id: 'kuli-alma', name: 'Kuli Alma', category: 'Club', url: 'https://www.facebook.com/kulialma' },
  // Theatre & Dance
  { id: 'suzanne-dellal', name: 'Suzanne Dellal', category: 'Theatre', url: 'https://suzannedellal.org.il' },
  // Galleries
  { id: 'artport', name: 'Artport Tel Aviv', category: 'Gallery', url: 'https://artport.art' },
  // Events & Ticketing
  { id: 'secret-telaviv', name: 'Secret Tel Aviv', category: 'Events', url: 'https://secrettelaviv.com' },
  { id: 'go-out', name: 'Go Out', category: 'Ticketing', url: 'https://go-out.co' },
  { id: 'eventim', name: 'Eventim', category: 'Ticketing', url: 'https://eventim.co.il' },
  { id: 'ticketmaster', name: 'Ticketmaster IL', category: 'Ticketing', url: 'https://ticketmaster.co.il' },
  // Municipal
  { id: 'tlv-municipality', name: 'TLV Municipality', category: 'Municipal', url: 'https://tel-aviv.gov.il' },
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
