export type ParticipationStatus = 'completed' | 'upcoming' | 'cancelled';

export interface ParticipationMockRecord {
  id: string;
  activityName: string;
  organization: string;
  date: string;
  hours: number | null;
  status: ParticipationStatus;
}

export interface ActivityDetailMock {
  id: string;
  title: string;
  organization: string;
  description: string;
  locationName: string;
  locationAddress: string;
  startTime: string;
  endTime: string;
  volunteerHours: number;
  maxParticipants: number;
  currentParticipants: number;
  status: ParticipationStatus | 'published';
  level: string;
  categories: string[];
  requirements: string[];
  heroImageUrl: string;
  mapImageUrl: string;
}

const mockDetailItems: ActivityDetailMock[] = [
  {
    id: 'community-garden-workshop',
    title: 'Community Garden Workshop',
    organization: 'Green Earth Org',
    description:
      "Join us for a hands-on workshop at the Downtown Community Garden! We're transforming an unused urban plot into a thriving vegetable sanctuary. Whether you're a seasoned green thumb or have never held a trowel, your help is invaluable.",
    locationName: 'Downtown Community Park',
    locationAddress: '123 Green Way, Austin, TX',
    startTime: '2023-10-14T09:00:00.000Z',
    endTime: '2023-10-14T13:00:00.000Z',
    volunteerHours: 4,
    maxParticipants: 20,
    currentParticipants: 12,
    status: 'completed',
    level: 'Beginner Friendly',
    categories: ['Environment', 'Education'],
    requirements: ['Gardening', 'Teaching', 'Teamwork'],
    heroImageUrl:
      'https://images.pexels.com/photos/7656740/pexels-photo-7656740.jpeg?auto=compress&cs=tinysrgb&w=1400',
    mapImageUrl:
      'https://staticmap.openstreetmap.de/staticmap.php?center=30.2672,-97.7431&zoom=12&size=640x360&markers=30.2672,-97.7431,red-pushpin',
  },
  {
    id: 'city-park-reforestation',
    title: 'City Park Reforestation',
    organization: 'GreenEarth Org',
    description:
      'Work with local ecologists to plant native trees and restore biodiversity in the city park ecosystem.',
    locationName: 'Riverside Park',
    locationAddress: '89 River Rd, Austin, TX',
    startTime: '2023-10-12T08:00:00.000Z',
    endTime: '2023-10-12T12:30:00.000Z',
    volunteerHours: 4.5,
    maxParticipants: 24,
    currentParticipants: 18,
    status: 'completed',
    level: 'All Levels',
    categories: ['Environment'],
    requirements: ['Planting', 'Teamwork'],
    heroImageUrl:
      'https://images.pexels.com/photos/1072824/pexels-photo-1072824.jpeg?auto=compress&cs=tinysrgb&w=1400',
    mapImageUrl:
      'https://staticmap.openstreetmap.de/staticmap.php?center=30.2767,-97.7412&zoom=12&size=640x360&markers=30.2767,-97.7412,red-pushpin',
  },
  {
    id: 'community-library-cataloging',
    title: 'Community Library Cataloging',
    organization: 'Public Library',
    description:
      'Support the library team in cataloging and labeling incoming book donations for community readers.',
    locationName: 'Central Public Library',
    locationAddress: '230 Main Street, Austin, TX',
    startTime: '2023-12-05T13:00:00.000Z',
    endTime: '2023-12-05T16:00:00.000Z',
    volunteerHours: 3,
    maxParticipants: 20,
    currentParticipants: 9,
    status: 'upcoming',
    level: 'Beginner Friendly',
    categories: ['Education'],
    requirements: ['Sorting', 'Attention to detail'],
    heroImageUrl:
      'https://images.pexels.com/photos/590493/pexels-photo-590493.jpeg?auto=compress&cs=tinysrgb&w=1400',
    mapImageUrl:
      'https://staticmap.openstreetmap.de/staticmap.php?center=30.2691,-97.7428&zoom=12&size=640x360&markers=30.2691,-97.7428,red-pushpin',
  },
  {
    id: 'night-shelter-meal-service',
    title: 'Night Shelter Meal Service',
    organization: 'Helping Hands',
    description:
      'Prepare and serve hot meals for shelter residents, and support cleanup after service.',
    locationName: 'Helping Hands Shelter',
    locationAddress: '42 Hope Avenue, Austin, TX',
    startTime: '2023-09-28T17:00:00.000Z',
    endTime: '2023-09-28T20:00:00.000Z',
    volunteerHours: 3,
    maxParticipants: 16,
    currentParticipants: 16,
    status: 'cancelled',
    level: 'All Levels',
    categories: ['Community'],
    requirements: ['Food safety', 'Teamwork'],
    heroImageUrl:
      'https://images.pexels.com/photos/6646914/pexels-photo-6646914.jpeg?auto=compress&cs=tinysrgb&w=1400',
    mapImageUrl:
      'https://staticmap.openstreetmap.de/staticmap.php?center=30.2555,-97.7297&zoom=12&size=640x360&markers=30.2555,-97.7297,red-pushpin',
  },
  {
    id: 'animal-shelter-cleaning',
    title: 'Animal Shelter Cleaning',
    organization: 'Paws & Rescue',
    description:
      'Help clean shelter spaces, prepare feeding stations, and improve living conditions for rescued animals.',
    locationName: 'Paws & Rescue Center',
    locationAddress: '55 Paw Street, Austin, TX',
    startTime: '2023-08-15T07:30:00.000Z',
    endTime: '2023-08-15T13:30:00.000Z',
    volunteerHours: 6,
    maxParticipants: 20,
    currentParticipants: 15,
    status: 'completed',
    level: 'Intermediate',
    categories: ['Animal Care'],
    requirements: ['Cleaning', 'Animal handling'],
    heroImageUrl:
      'https://images.pexels.com/photos/5731866/pexels-photo-5731866.jpeg?auto=compress&cs=tinysrgb&w=1400',
    mapImageUrl:
      'https://staticmap.openstreetmap.de/staticmap.php?center=30.2758,-97.7436&zoom=12&size=640x360&markers=30.2758,-97.7436,red-pushpin',
  },
];

export const mockParticipationHistory: ParticipationMockRecord[] = mockDetailItems.map((item) => ({
  id: item.id,
  activityName: item.title,
  organization: item.organization,
  date: item.startTime,
  hours: item.status === 'cancelled' ? null : item.volunteerHours,
  status: item.status === 'published' ? 'upcoming' : item.status,
}));

export function getMockActivityDetailById(id: string): ActivityDetailMock | null {
  return mockDetailItems.find((item) => item.id === id) ?? null;
}
