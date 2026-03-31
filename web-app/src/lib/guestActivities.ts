export type GuestActivityStatus = 'published' | 'completed' | 'cancelled';

export interface GuestActivityLocation {
  address: string;
  city: string;
}

export interface GuestActivityRecord {
  id: string;
  title: string;
  organization: string;
  description: string;
  location: GuestActivityLocation;
  startTime: string;
  endTime: string;
  capacity: number;
  currentParticipants: number;
  requiredSkills: string[];
  status: GuestActivityStatus;
  imageUrl: string;
  mapImageUrl: string;
}

const DEFAULT_MAP_IMAGE =
  'https://staticmap.openstreetmap.de/staticmap.php?center=10.7769,106.7009&zoom=12&size=640x360&markers=10.7769,106.7009,red-pushpin';

const guestActivities: GuestActivityRecord[] = [
  {
    id: 'river-cleanup-sat',
    title: 'River Cleanup Saturday',
    organization: 'Green Steps Collective',
    description:
      'Join local residents to clean trash along the riverside and sort recyclable materials. Gloves and tools are prepared on-site.',
    location: {
      address: 'Sai Gon Riverside Park',
      city: 'Ho Chi Minh City',
    },
    startTime: '2026-04-11T01:00:00.000Z',
    endTime: '2026-04-11T04:00:00.000Z',
    capacity: 80,
    currentParticipants: 42,
    requiredSkills: ['Teamwork', 'Waste Sorting', 'Outdoor'],
    status: 'published',
    imageUrl: 'https://images.pexels.com/photos/6646918/pexels-photo-6646918.jpeg?auto=compress&cs=tinysrgb&w=1200',
    mapImageUrl: DEFAULT_MAP_IMAGE,
  },
  {
    id: 'food-bank-packaging',
    title: 'Food Bank Packaging Drive',
    organization: 'City Relief Hub',
    description:
      'Help package food kits for low-income families. Volunteers will sort ingredients, pack boxes, and prepare delivery batches.',
    location: {
      address: 'District 7 Community Center',
      city: 'Ho Chi Minh City',
    },
    startTime: '2026-04-15T06:00:00.000Z',
    endTime: '2026-04-15T09:30:00.000Z',
    capacity: 55,
    currentParticipants: 31,
    requiredSkills: ['Packing', 'Coordination'],
    status: 'published',
    imageUrl: 'https://images.pexels.com/photos/6995268/pexels-photo-6995268.jpeg?auto=compress&cs=tinysrgb&w=1200',
    mapImageUrl: DEFAULT_MAP_IMAGE,
  },
  {
    id: 'youth-mentoring-day',
    title: 'Youth Mentoring Day',
    organization: 'Future Makers Foundation',
    description:
      'Support high-school students with career orientation workshops, mock interviews, and communication activities.',
    location: {
      address: 'Thu Duc Innovation Campus',
      city: 'Ho Chi Minh City',
    },
    startTime: '2026-04-20T01:30:00.000Z',
    endTime: '2026-04-20T06:00:00.000Z',
    capacity: 40,
    currentParticipants: 17,
    requiredSkills: ['Mentoring', 'Public Speaking'],
    status: 'published',
    imageUrl: 'https://images.pexels.com/photos/6647043/pexels-photo-6647043.jpeg?auto=compress&cs=tinysrgb&w=1200',
    mapImageUrl: DEFAULT_MAP_IMAGE,
  },
  {
    id: 'tree-planting-mar',
    title: 'Neighborhood Tree Planting',
    organization: 'Eco Ward Team',
    description:
      'A completed campaign where volunteers planted native trees in school zones and measured soil health with local teams.',
    location: {
      address: 'Binh Thanh School Cluster',
      city: 'Ho Chi Minh City',
    },
    startTime: '2026-03-08T00:30:00.000Z',
    endTime: '2026-03-08T04:30:00.000Z',
    capacity: 70,
    currentParticipants: 70,
    requiredSkills: ['Gardening', 'Community Outreach'],
    status: 'completed',
    imageUrl: 'https://images.pexels.com/photos/5731866/pexels-photo-5731866.jpeg?auto=compress&cs=tinysrgb&w=1200',
    mapImageUrl: DEFAULT_MAP_IMAGE,
  },
  {
    id: 'library-donation-cancelled',
    title: 'Library Donation Logistics',
    organization: 'Books For Everyone',
    description:
      'This campaign was cancelled due to venue maintenance. New schedule will be announced in a future community update.',
    location: {
      address: 'District 3 Public Library',
      city: 'Ho Chi Minh City',
    },
    startTime: '2026-04-05T02:00:00.000Z',
    endTime: '2026-04-05T06:00:00.000Z',
    capacity: 35,
    currentParticipants: 12,
    requiredSkills: ['Sorting', 'Inventory'],
    status: 'cancelled',
    imageUrl: 'https://images.pexels.com/photos/6646907/pexels-photo-6646907.jpeg?auto=compress&cs=tinysrgb&w=1200',
    mapImageUrl: DEFAULT_MAP_IMAGE,
  },
];

export function listGuestActivities(): GuestActivityRecord[] {
  return guestActivities;
}

export function getGuestActivityById(activityId: string): GuestActivityRecord | null {
  return guestActivities.find((activity) => activity.id === activityId) ?? null;
}
