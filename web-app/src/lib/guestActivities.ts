import type { BadgeTone } from '../components/ui/Badge';

export type GuestActivityStatus = 'published';
export type GuestAvailabilityTone = 'open' | 'filling_fast' | 'waitlist';

export interface GuestActivityLocation {
  address: string;
  city: string;
  meetingPoint: string;
  lat: number;
  lng: number;
}

export interface GuestActivityRequirement {
  title: string;
  description: string;
}

export interface GuestActivityRecord {
  id: string;
  title: string;
  organization: string;
  organizerName: string;
  organizerTitle: string;
  organizerAvatarUrl: string;
  organizerRating: number;
  organizerNote: string;
  excerpt: string;
  cardSummary: string;
  description: string;
  impactSummary: string;
  location: GuestActivityLocation;
  startTime: string;
  endTime: string;
  capacity: number;
  currentParticipants: number;
  requiredSkills: string[];
  status: GuestActivityStatus;
  imageUrl: string;
  mapImageUrl: string;
  domain: string;
  tags: string[];
  requirements: GuestActivityRequirement[];
  featured: boolean;
  stats: Array<{ label: string; value: string }>;
}

const guestActivities: GuestActivityRecord[] = [
  {
    id: 'urban-forest-phase-2',
    title: 'Urban Forest Initiative: Phase 2',
    organization: 'Green Earth Collective',
    organizerName: 'Lina Park',
    organizerTitle: 'Program Lead',
    organizerAvatarUrl:
      'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=300',
    organizerRating: 4.8,
    organizerNote: 'This organizer has led 12 public sustainability campaigns in the last year.',
    excerpt: 'Help expand the growing city tree canopy by documenting soil conditions and planting resilient native species.',
    cardSummary: 'Help expand the growing city tree canopy by documenting soil conditions and planting resilient native species.',
    description:
      'Join neighborhood volunteers for the second phase of the urban forest initiative. This shift combines planting, stewarding young trees, and documenting environmental observations so future teams can measure long-term impact.',
    impactSummary:
      'This campaign restores shade corridors, improves biodiversity, and creates healthier walkable community spaces.',
    location: {
      address: 'Sunset Grove East Park',
      city: 'Greenfield',
      meetingPoint: 'North garden kiosk',
      lat: 10.7769,
      lng: 106.7009,
    },
    startTime: '2026-04-12T02:00:00.000Z',
    endTime: '2026-04-12T06:00:00.000Z',
    capacity: 48,
    currentParticipants: 28,
    requiredSkills: ['Community Gardening', 'Documentation', 'Teamwork'],
    status: 'published',
    imageUrl: 'https://images.pexels.com/photos/6646918/pexels-photo-6646918.jpeg?auto=compress&cs=tinysrgb&w=1200',
    mapImageUrl:
      'https://images.pexels.com/photos/4386467/pexels-photo-4386467.jpeg?auto=compress&cs=tinysrgb&w=1200',
    domain: 'Sustainability',
    tags: ['Environment', 'Volunteer'],
    requirements: [
      { title: 'Physical Ability', description: 'Must be able to walk on uneven paths and stand for 2-3 hours.' },
      { title: 'Age Limit', description: 'Volunteers must be 16+ or accompanied by an adult.' },
      { title: 'Materials', description: 'Bring a refillable water bottle and wear outdoor-friendly clothing.' },
      { title: 'Briefing', description: 'A short safety and planting briefing starts 20 minutes before check-in.' },
    ],
    featured: true,
    stats: [
      { label: 'Capacity', value: '48 volunteers' },
      { label: 'Duration', value: '4 hours' },
      { label: 'Impact', value: 'High' },
      { label: 'Points', value: '140 VP' },
    ],
  },
  {
    id: 'code-for-kids-workshop',
    title: 'Code for Kids Workshop',
    organization: 'Future Minds Foundation',
    organizerName: 'Maya Torres',
    organizerTitle: 'Education Coordinator',
    organizerAvatarUrl:
      'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=300',
    organizerRating: 4.7,
    organizerNote: 'Recognized for inclusive digital literacy workshops for middle-school learners.',
    excerpt: 'Mentor small groups and guide basic coding activities designed to build confidence and curiosity.',
    cardSummary: 'Mentor young minds in Python basics and collaborative problem-solving one Saturday morning.',
    description:
      'Volunteers support a hands-on coding workshop for students exploring their first programming concepts. You will help facilitators explain logic, coach small breakout groups, and keep the session supportive and welcoming.',
    impactSummary:
      'Students leave with practical coding exercises completed and a stronger sense of confidence around digital learning.',
    location: {
      address: 'Tech Hub Library',
      city: 'North Harbor',
      meetingPoint: 'Second-floor workshop room',
      lat: 10.7824,
      lng: 106.6934,
    },
    startTime: '2026-04-18T08:30:00.000Z',
    endTime: '2026-04-18T11:30:00.000Z',
    capacity: 26,
    currentParticipants: 21,
    requiredSkills: ['Teaching', 'Python Basics', 'Mentoring'],
    status: 'published',
    imageUrl: 'https://images.pexels.com/photos/1181677/pexels-photo-1181677.jpeg?auto=compress&cs=tinysrgb&w=1200',
    mapImageUrl:
      'https://images.pexels.com/photos/669615/pexels-photo-669615.jpeg?auto=compress&cs=tinysrgb&w=1200',
    domain: 'Education',
    tags: ['Education', 'Technology'],
    requirements: [
      { title: 'Facilitation', description: 'Comfortable speaking with groups of 4-6 students.' },
      { title: 'Mentoring', description: 'Patient, encouraging communication style is preferred.' },
      { title: 'Laptop Friendly', description: 'Bring your own laptop if possible for breakout support.' },
      { title: 'Orientation', description: 'A 15-minute volunteer briefing is sent after registration.' },
    ],
    featured: true,
    stats: [
      { label: 'Capacity', value: '26 volunteers' },
      { label: 'Duration', value: '3 hours' },
      { label: 'Impact', value: 'Medium' },
      { label: 'Points', value: '120 VP' },
    ],
  },
  {
    id: 'weekend-food-drive-distribution',
    title: 'Weekend Food Drive Distribution',
    organization: 'City Relief Network',
    organizerName: 'Jordan Bell',
    organizerTitle: 'Community Operations Lead',
    organizerAvatarUrl:
      'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=300',
    organizerRating: 4.6,
    organizerNote: 'Known for efficient distribution days with strong logistics and volunteer care.',
    excerpt: 'Join us in sorting and delivering essential pantry kits to families in need across the district.',
    cardSummary: 'Sort supplies and coordinate short delivery routes for households in immediate need.',
    description:
      'This weekend food distribution mobilizes volunteers to sort donated produce, package family-sized kits, and support final-mile delivery coordination for community hubs and partner shelters.',
    impactSummary:
      'Food insecurity relief is accelerated when volunteer teams keep packing lines moving and support accessible hand-off points.',
    location: {
      address: 'Main Street Warehouse',
      city: 'Cedar View',
      meetingPoint: 'Loading dock entrance',
      lat: 10.7954,
      lng: 106.6872,
    },
    startTime: '2026-04-19T01:00:00.000Z',
    endTime: '2026-04-19T05:00:00.000Z',
    capacity: 32,
    currentParticipants: 32,
    requiredSkills: ['Coordination', 'Packing', 'Logistics'],
    status: 'published',
    imageUrl: 'https://images.pexels.com/photos/6995268/pexels-photo-6995268.jpeg?auto=compress&cs=tinysrgb&w=1200',
    mapImageUrl:
      'https://images.pexels.com/photos/4386442/pexels-photo-4386442.jpeg?auto=compress&cs=tinysrgb&w=1200',
    domain: 'Community',
    tags: ['Social', 'Relief'],
    requirements: [
      { title: 'Physical Ability', description: 'Some lifting of light supply boxes may be required.' },
      { title: 'Time Commitment', description: 'Please arrive on time for team assignment and route setup.' },
      { title: 'Food Safety', description: 'Simple hygiene and handling guidance is provided at check-in.' },
      { title: 'Team Support', description: 'Volunteers will be assigned to packing or route support based on need.' },
    ],
    featured: true,
    stats: [
      { label: 'Capacity', value: '32 volunteers' },
      { label: 'Duration', value: '4 hours' },
      { label: 'Impact', value: 'High' },
      { label: 'Points', value: '160 VP' },
    ],
  },
  {
    id: 'entrepreneurial-mentor-session',
    title: 'Entrepreneurial Mentor Session',
    organization: 'Youth Success Circle',
    organizerName: 'Carla Young',
    organizerTitle: 'Program Mentor Lead',
    organizerAvatarUrl:
      'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=300',
    organizerRating: 4.9,
    organizerNote: 'Consistently praised for mentorship quality and strong volunteer onboarding.',
    excerpt: 'Encourage local small business founders by sharing early-stage advice and presentation feedback.',
    cardSummary: 'Discuss small-business plans, share structured feedback, and help founders shape next steps.',
    description:
      'This mentorship session pairs volunteers with aspiring entrepreneurs from underrepresented communities. Volunteers guide business model thinking, presentation structure, and confidence-building exercises.',
    impactSummary:
      'Early-stage founders gain perspective, confidence, and clearer next-step actions after the session.',
    location: {
      address: 'Central Business Hub',
      city: 'Hillcrest',
      meetingPoint: 'Lobby mentor desk',
      lat: 10.7645,
      lng: 106.6891,
    },
    startTime: '2026-04-21T10:00:00.000Z',
    endTime: '2026-04-21T12:30:00.000Z',
    capacity: 24,
    currentParticipants: 12,
    requiredSkills: ['Mentorship', 'Business Strategy', 'Listening'],
    status: 'published',
    imageUrl: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1200',
    mapImageUrl:
      'https://images.pexels.com/photos/4386394/pexels-photo-4386394.jpeg?auto=compress&cs=tinysrgb&w=1200',
    domain: 'Business',
    tags: ['Business', 'Mentorship'],
    requirements: [
      { title: 'Experience', description: 'Prior mentoring or facilitation experience is helpful but not required.' },
      { title: 'Communication', description: 'Be prepared to give kind, specific, and constructive feedback.' },
      { title: 'Preparation', description: 'Session agenda is shared 24 hours before the event.' },
      { title: 'Professionalism', description: 'Please arrive business-casual and ready for small group conversations.' },
    ],
    featured: false,
    stats: [
      { label: 'Capacity', value: '24 volunteers' },
      { label: 'Duration', value: '2.5 hours' },
      { label: 'Impact', value: 'Medium' },
      { label: 'Points', value: '100 VP' },
    ],
  },
  {
    id: 'intergenerational-art-day',
    title: 'Intergenerational Art Day',
    organization: 'Golden Years Center',
    organizerName: 'Sofia Reed',
    organizerTitle: 'Creative Programs Director',
    organizerAvatarUrl:
      'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=300',
    organizerRating: 4.8,
    organizerNote: 'Hosts inclusive arts activities designed for both seniors and young volunteers.',
    excerpt: 'Connect with local seniors through creative workshops focused on storytelling, color, and memory.',
    cardSummary: 'Support shared art-making circles that bring older adults and young volunteers together.',
    description:
      'Intergenerational Art Day invites volunteers to co-facilitate drawing and collage activities alongside senior residents. The session emphasizes conversation, memory-sharing, and low-pressure creative expression.',
    impactSummary:
      'Participants experience stronger connection, conversation, and joy through collaborative art-making.',
    location: {
      address: 'Golden Years Center',
      city: 'Lakeview',
      meetingPoint: 'Main studio reception',
      lat: 10.7587,
      lng: 106.6752,
    },
    startTime: '2026-04-25T02:00:00.000Z',
    endTime: '2026-04-25T05:00:00.000Z',
    capacity: 20,
    currentParticipants: 11,
    requiredSkills: ['Creativity', 'Facilitation', 'Empathy'],
    status: 'published',
    imageUrl: 'https://images.pexels.com/photos/7551603/pexels-photo-7551603.jpeg?auto=compress&cs=tinysrgb&w=1200',
    mapImageUrl:
      'https://images.pexels.com/photos/4386374/pexels-photo-4386374.jpeg?auto=compress&cs=tinysrgb&w=1200',
    domain: 'Arts',
    tags: ['Arts', 'Community'],
    requirements: [
      { title: 'Accessibility', description: 'Volunteers should be comfortable assisting participants with mobility needs.' },
      { title: 'Creativity', description: 'No formal art background is required; encouragement matters most.' },
      { title: 'Patience', description: 'The session moves at a gentle pace to support conversation and inclusion.' },
      { title: 'Materials', description: 'All supplies are provided at the venue.' },
    ],
    featured: false,
    stats: [
      { label: 'Capacity', value: '20 volunteers' },
      { label: 'Duration', value: '3 hours' },
      { label: 'Impact', value: 'High' },
      { label: 'Points', value: '130 VP' },
    ],
  },
  {
    id: 'coastal-restoration-beach-cleanup',
    title: 'Coastal Restoration & Beach Cleanup',
    organization: 'Blue Tides Alliance',
    organizerName: 'Marcus Thorne',
    organizerTitle: 'Director of Eco-Alliance',
    organizerAvatarUrl:
      'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=300',
    organizerRating: 4.8,
    organizerNote: 'This activity is recognized as a Platinum-tier project for community impact.',
    excerpt: 'Protect a vulnerable shoreline by collecting waste, documenting debris, and restoring coastal habitat buffers.',
    cardSummary: 'Join our marine restoration effort to improve shoreline health and support long-term ecosystem recovery.',
    description:
      'Join our mission to restore the beauty of local coastlines. This public shift is about picking up litter, documenting debris types for research, and carefully supporting young mangrove zones under facilitator guidance. Volunteers will rotate across cleanup, sorting, and habitat buffer support so every contribution is visible and meaningful.',
    impactSummary:
      'Our project is restoring 3 acres of coastal habitat, providing a natural buffer against rising sea levels while fostering local biodiversity.',
    location: {
      address: 'Oceanfront Park, Bay Area',
      city: 'North Shore',
      meetingPoint: 'The Lighthouse Kiosk, North Entrance',
      lat: 10.8012,
      lng: 106.7281,
    },
    startTime: '2026-04-24T01:00:00.000Z',
    endTime: '2026-04-24T05:00:00.000Z',
    capacity: 45,
    currentParticipants: 33,
    requiredSkills: ['Sustainability', 'Ocean Care', 'Teamwork'],
    status: 'published',
    imageUrl: 'https://images.pexels.com/photos/6646907/pexels-photo-6646907.jpeg?auto=compress&cs=tinysrgb&w=1200',
    mapImageUrl:
      'https://images.pexels.com/photos/4386445/pexels-photo-4386445.jpeg?auto=compress&cs=tinysrgb&w=1200',
    domain: 'Sustainability',
    tags: ['Environment', 'Ocean'],
    requirements: [
      { title: 'Physical Ability', description: 'Must be able to walk on uneven sandy terrain for 2-3 hours.' },
      { title: 'Age Limit', description: 'Volunteers under 18 must be accompanied by an adult.' },
      { title: 'Materials', description: 'Gloves and bags provided. Bring your own reusable water bottle.' },
      { title: 'Pre-Briefing', description: 'A 30-minute restoration safety orientation begins before the shift.' },
    ],
    featured: true,
    stats: [
      { label: 'Capacity', value: '45 volunteers' },
      { label: 'Duration', value: '4 hours' },
      { label: 'Impact', value: 'High' },
      { label: 'Points', value: '150 VP' },
    ],
  },
];

export function listGuestActivities() {
  return guestActivities.filter((activity) => activity.status === 'published');
}

export function listFeaturedGuestActivities(limit = 3) {
  return listGuestActivities()
    .filter((activity) => activity.featured)
    .slice(0, limit);
}

export function getGuestActivityById(activityId: string) {
  return listGuestActivities().find((activity) => activity.id === activityId) ?? null;
}

export function getGuestDomains() {
  return [
    {
      title: 'Sustainability',
      description: 'Restore ecosystems, expand green spaces, and protect shared local resources.',
      accentClass: 'is-emerald',
    },
    {
      title: 'Education',
      description: 'Mentor learners and create access to practical, future-focused skills.',
      accentClass: 'is-sky',
    },
    {
      title: 'Health',
      description: 'Support community wellbeing through relief drives, outreach, and care networks.',
      accentClass: 'is-aqua',
    },
  ];
}

export function getGuestAvailabilityMeta(activity: GuestActivityRecord): {
  label: string;
  tone: GuestAvailabilityTone;
  badgeTone: BadgeTone;
} {
  const ratio = activity.capacity > 0 ? activity.currentParticipants / activity.capacity : 0;

  if (activity.currentParticipants >= activity.capacity) {
    return {
      label: 'Waitlist Only',
      tone: 'waitlist',
      badgeTone: 'neutral',
    };
  }

  if (ratio >= 0.75) {
    return {
      label: 'Filling Fast',
      tone: 'filling_fast',
      badgeTone: 'danger',
    };
  }

  return {
    label: 'Open',
    tone: 'open',
    badgeTone: 'success',
  };
}
