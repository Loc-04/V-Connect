import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import './BrowseOpportunitiesPage.css';

type CategoryTone = 'blue' | 'orange' | 'green' | 'purple' | 'red';

interface Opportunity {
  id: string;
  category: string;
  categoryTone: CategoryTone;
  imageUrl: string;
  date: string;
  title: string;
  location: string;
  tags: string[];
  spotsLeft: number;
}

const opportunities: Opportunity[] = [
  {
    id: 'beach-cleanup',
    category: 'Environment',
    categoryTone: 'blue',
    imageUrl: 'https://www.figma.com/api/mcp/asset/73bbdb6f-1786-4a38-9a37-ecf34fb60d25',
    date: 'Sat, Oct 14 • 9:00 AM',
    title: 'Weekend Beach Cleanup',
    location: 'Santa Monica Pier, CA (2 mi)',
    tags: ['Teamwork', 'Outdoors'],
    spotsLeft: 5,
  },
  {
    id: 'after-school-tutor',
    category: 'Education',
    categoryTone: 'orange',
    imageUrl: 'https://www.figma.com/api/mcp/asset/c4e0a534-32d3-49cb-aba8-14a2b2056a79',
    date: 'Mon, Oct 16 • 3:30 PM',
    title: 'After-School Tutor',
    location: 'Lincoln High School, CA (5 mi)',
    tags: ['Math', 'Mentorship'],
    spotsLeft: 2,
  },
  {
    id: 'food-bank-sorting',
    category: 'Community',
    categoryTone: 'green',
    imageUrl: 'https://www.figma.com/api/mcp/asset/6a5002f9-8b8f-45bf-acdf-9bb974a7cbde',
    date: 'Tue, Oct 17 • 10:00 AM',
    title: 'Food Bank Sorting',
    location: 'LA Food Bank, CA (8 mi)',
    tags: ['Packing', 'Organizing'],
    spotsLeft: 12,
  },
  {
    id: 'senior-center',
    category: 'Elderly Care',
    categoryTone: 'purple',
    imageUrl: 'https://www.figma.com/api/mcp/asset/0dffc8ae-0616-4cc0-a486-52548c62cde2',
    date: 'Wed, Oct 18 • 1:00 PM',
    title: 'Senior Center Companion',
    location: 'Sunrise Home, CA (3 mi)',
    tags: ['Social', 'Empathy'],
    spotsLeft: 3,
  },
  {
    id: 'soup-kitchen',
    category: 'Kitchen',
    categoryTone: 'red',
    imageUrl: 'https://www.figma.com/api/mcp/asset/fd82fe30-483f-4524-933f-e39542f9a28b',
    date: 'Fri, Oct 20 • 5:00 PM',
    title: 'Evening Soup Kitchen',
    location: 'Downtown Shelter, CA (10 mi)',
    tags: ['Cooking', 'Service'],
    spotsLeft: 8,
  },
  {
    id: 'tree-planting',
    category: 'Environment',
    categoryTone: 'blue',
    imageUrl: 'https://www.figma.com/api/mcp/asset/193c5a23-bc14-46de-81ef-4add7d40b32c',
    date: 'Sat, Oct 21 • 8:00 AM',
    title: 'City Park Tree Planting',
    location: 'Griffith Park, CA (12 mi)',
    tags: ['Gardening', 'Physical'],
    spotsLeft: 20,
  },
];

const filterLabels = ['Category', 'Distance', 'Date'];

export function BrowseOpportunitiesPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <main className="browse-page">
      <header className="browse-top-nav">
        <div className="browse-container browse-nav-inner">
          <div className="browse-brand">
            <img alt="" className="browse-brand-logo" src="https://www.figma.com/api/mcp/asset/25df3982-f136-40ef-a70b-1f115f888a93" />
            <span>V-Connect</span>
          </div>

          <div className="browse-nav-actions">
            <button className="browse-nav-link" type="button">
              Home
            </button>
            <button className="browse-nav-link browse-nav-link-active" type="button">
              Browse
            </button>
            <button className="browse-nav-link" type="button">
              My Activities
            </button>
            <button className="browse-nav-link" type="button">
              Profile
            </button>
            <button className="browse-logout-btn" onClick={handleSignOut} type="button">
              Log Out
            </button>
          </div>
        </div>
      </header>

      <section className="browse-main">
        <div className="browse-container">
          <div className="browse-hero">
            <h1>Find your next impact</h1>
            <p>Browse local volunteer opportunities and make a difference today.</p>
          </div>

          <div className="browse-search-wrap">
            <div className="browse-search-input-shell">
              <SearchIcon />
              <input aria-label="Search opportunities" placeholder="Search by keyword, skill, or cause..." type="text" />
            </div>

            <div className="browse-search-divider" />

            <div className="browse-filters">
              {filterLabels.map((label) => (
                <button className="browse-filter-btn" key={label} type="button">
                  {label}
                  <ChevronDownIcon />
                </button>
              ))}
              <button className="browse-filter-icon-btn" type="button">
                <FilterIcon />
              </button>
            </div>
          </div>

          <section className="browse-grid" aria-label="Volunteer opportunities">
            {opportunities.map((opportunity) => (
              <article className="browse-card" key={opportunity.id}>
                <div className="browse-card-image-wrap">
                  <img alt={opportunity.title} className="browse-card-image" src={opportunity.imageUrl} />
                  <span className={`browse-category browse-category-${opportunity.categoryTone}`}>{opportunity.category}</span>
                  <button aria-label="Save opportunity" className="browse-favorite-btn" type="button">
                    <HeartIcon />
                  </button>
                </div>

                <div className="browse-card-body">
                  <div className="browse-meta-line">
                    <CalendarIcon />
                    <span>{opportunity.date}</span>
                  </div>

                  <h2>{opportunity.title}</h2>

                  <div className="browse-meta-line browse-location-line">
                    <PinIcon />
                    <span>{opportunity.location}</span>
                  </div>

                  <div className="browse-tags">
                    {opportunity.tags.map((tag) => (
                      <span className="browse-tag" key={`${opportunity.id}-${tag}`}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="browse-card-footer">
                    <span>{opportunity.spotsLeft} spots left</span>
                    <button className="browse-apply-btn" type="button">
                      Quick Apply
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <div className="browse-load-more-row">
            <button className="browse-load-more-btn" type="button">
              Load More Opportunities
              <ChevronDownIcon />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon" fill="none" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon-sm" fill="none" viewBox="0 0 24 24">
      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon-sm" fill="none" viewBox="0 0 24 24">
      <path d="M4 7H20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M8 12H16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M10.5 17H13.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon-sm" fill="none" viewBox="0 0 24 24">
      <path
        d="M12.05 20.2C11.75 20.2 11.47 20.1 11.25 19.92C8.25 17.46 3.9 13.95 3.9 9.2C3.9 6.58 5.98 4.5 8.6 4.5C10.07 4.5 11.47 5.17 12.4 6.31C13.33 5.17 14.73 4.5 16.2 4.5C18.82 4.5 20.9 6.58 20.9 9.2C20.9 13.95 16.55 17.46 13.55 19.92C13.33 20.1 12.35 20.2 12.05 20.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon-sm" fill="none" viewBox="0 0 24 24">
      <rect height="15" rx="2" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="6" />
      <path d="M8 3V8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="M16 3V8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="M4 10H20" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon-sm" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 21C12 21 18 15.5 18 10.5C18 7.46 15.54 5 12.5 5C9.46 5 7 7.46 7 10.5C7 15.5 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12.5" cy="10.5" r="1.6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
