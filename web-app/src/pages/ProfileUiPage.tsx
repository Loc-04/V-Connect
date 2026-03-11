import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Award,
  Bell,
  Camera,
  CalendarDays,
  History,
  LayoutDashboard,
  Leaf,
  LogOut,
  Medal,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Trees,
} from 'lucide-react';
import './ProfileUiPage.css';

const weekBars = [32, 44, 20, 38, 74, 75, 20];

const skillTags = [
  { name: 'Project Management', level: 'EXPERT', tone: 'green' },
  { name: 'Gardening', level: 'INTER', tone: 'blue' },
  { name: 'Teaching', level: 'ADV', tone: 'purple' },
  { name: 'First Aid', level: 'BASIC', tone: 'orange' },
  { name: 'Graphic Design', level: 'INTER', tone: 'blue' },
];

const interests = [
  'Environmental Conservation',
  'Animal Welfare',
  'Youth Mentorship',
  'Disaster Relief',
  'Community Arts',
  'Elderly Care',
];

interface ProfileMenuItem {
  label: string;
  icon: LucideIcon;
  active?: boolean;
}

const menuMain = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'My Activities', icon: Activity },
  { label: 'Recommendations', icon: Sparkles },
] satisfies ProfileMenuItem[];

const menuRecords = [
  { label: 'Participation History', icon: History },
  { label: 'Certificates', icon: Award },
] satisfies ProfileMenuItem[];

export function ProfileUiPage() {
  return (
    <div className="vol-profile-page">
      <aside className="vol-profile-sidebar">
        <div className="vol-profile-brand">
          <span className="vol-profile-brand-mark" aria-hidden="true">
            <Activity size={14} />
          </span>
          <span className="vol-profile-brand-text">V-Connect</span>
        </div>

        <p className="vol-profile-menu-title">MAIN MENU</p>
        <nav className="vol-profile-menu-list" aria-label="Main menu">
          {menuMain.map((item) => (
            <a className={`vol-profile-menu-item ${item.active ? 'vol-profile-active' : ''}`} href="#" key={item.label}>
              <span className="vol-profile-menu-icon" aria-hidden="true">
                <item.icon size={16} />
              </span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <p className="vol-profile-menu-title vol-profile-menu-second">RECORDS</p>
        <nav className="vol-profile-menu-list" aria-label="Records">
          {menuRecords.map((item) => (
            <a className="vol-profile-menu-item" href="#" key={item.label}>
              <span className="vol-profile-menu-icon" aria-hidden="true">
                <item.icon size={16} />
              </span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="vol-profile-sidebar-footer">
          <a className="vol-profile-menu-item" href="#">
            <span className="vol-profile-menu-icon" aria-hidden="true">
              <Settings size={16} />
            </span>
            <span>Settings</span>
          </a>
          <a className="vol-profile-menu-item" href="#">
            <span className="vol-profile-menu-icon" aria-hidden="true">
              <LogOut size={16} />
            </span>
            <span>Logout</span>
          </a>
        </div>
      </aside>

      <section className="vol-profile-content">
        <header className="vol-profile-topbar">
          <input className="vol-profile-search-box" placeholder="Search opportunities..." />
          <div className="vol-profile-topbar-user">
            <button aria-label="Notifications" className="vol-profile-bell" type="button">
              <Bell size={14} />
            </button>
            <div className="vol-profile-topbar-divider" />
            <div className="vol-profile-user-meta">
              <strong>Sarah Jenkins</strong>
              <span>Volunteer</span>
            </div>
            <img
              alt="Sarah Jenkins"
              className="vol-profile-avatar-mini"
              src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80"
            />
          </div>
        </header>

        <main className="vol-profile-main-scroll">
          <div className="vol-profile-page-head">
            <div>
              <h1>Profile Overview</h1>
              <p>Manage your volunteer identity, skills, and schedule.</p>
            </div>
            <button className="vol-profile-ai-btn" type="button">Get AI Recommendations</button>
          </div>

          <article className="vol-profile-card vol-profile-hero-card">
            <div className="vol-profile-hero-grid">
              <div className="vol-profile-avatar-wrap">
                <img
                  alt="Sarah Jenkins"
                  className="vol-profile-avatar-lg"
                  src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80"
                />
                <button className="vol-profile-camera-btn" type="button" aria-label="Change avatar">
                  <Camera size={12} />
                </button>
              </div>

              <div>
                <div className="vol-profile-name-row">
                  <h2>Sarah Jenkins</h2>
                  <span className="vol-profile-badge vol-profile-badge-volunteer">Volunteer</span>
                  <span className="vol-profile-badge vol-profile-badge-gold">Gold Level</span>
                </div>
                <p className="vol-profile-bio">
                  Dedicated environmentalist passionate about community gardening and youth education programs.
                  Always looking for new ways to contribute to a greener future through collaborative efforts.
                </p>

                <div className="vol-profile-metric-row">
                  <div className="vol-profile-metric-box">
                    <span className="vol-profile-metric-icon vol-profile-metric-icon-green" aria-hidden="true">
                      <Leaf size={16} />
                    </span>
                    <div>
                      <small>Total Impact</small>
                      <strong>450+ Hours</strong>
                    </div>
                  </div>
                  <div className="vol-profile-metric-box">
                    <span className="vol-profile-metric-icon vol-profile-metric-icon-blue" aria-hidden="true">
                      <CalendarDays size={16} />
                    </span>
                    <div>
                      <small>Member Since</small>
                      <strong>March 2022</strong>
                    </div>
                  </div>
                  <div className="vol-profile-metric-box">
                    <span className="vol-profile-metric-icon vol-profile-metric-icon-purple" aria-hidden="true">
                      <Medal size={16} />
                    </span>
                    <div>
                      <small>Reputation</small>
                      <strong>98/100 Score</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="vol-profile-hero-action">
                <button type="button">Edit Profile</button>
              </div>
            </div>
          </article>

          <div className="vol-profile-grid-two">
            <article className="vol-profile-card">
              <div className="vol-profile-card-head">
                <h3>Skills & Expertise</h3>
                <button type="button" aria-label="Add skill">
                  <Plus size={16} />
                </button>
              </div>
              <div className="vol-profile-chips">
                {skillTags.map((skill) => (
                  <span className={`vol-profile-chip vol-profile-chip-${skill.tone}`} key={skill.name}>
                    <span className="vol-profile-chip-dot" aria-hidden="true" />
                    {skill.name}
                    <em>{skill.level}</em>
                  </span>
                ))}
              </div>
            </article>

            <article className="vol-profile-card vol-profile-availability-card">
              <div className="vol-profile-card-head">
                <h3>Availability</h3>
                <button type="button" aria-label="Edit availability">
                  <Pencil size={14} />
                </button>
              </div>
              <div className="vol-profile-week-labels">
                <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
              </div>
              <div className="vol-profile-bars">
                {weekBars.map((height, idx) => (
                  <span className="vol-profile-bar-wrap" key={`${idx}-${height}`}>
                    <span
                      className={`vol-profile-bar ${idx === 4 || idx === 5 ? 'vol-profile-bar-active' : ''}`}
                      style={{ height: `${height}%` }}
                    />
                    {idx === 4 && <span className="vol-profile-bar-label">Fri</span>}
                    {idx === 5 && <span className="vol-profile-bar-label">Sat</span>}
                  </span>
                ))}
              </div>
              <p className="vol-profile-mini-note">Your preferred schedule is mainly weekends.</p>
            </article>
          </div>

          <div className="vol-profile-grid-two">
            <article className="vol-profile-card">
              <div className="vol-profile-card-head">
                <h3>Interests & Causes</h3>
                <button type="button" className="vol-profile-text-link">Manage</button>
              </div>
              <div className="vol-profile-chips">
                {interests.map((interest) => (
                  <span className="vol-profile-interest-chip" key={interest}>{interest}</span>
                ))}
                <span className="vol-profile-interest-chip vol-profile-interest-add">+ Add Interest</span>
              </div>
            </article>

            <article className="vol-profile-card vol-profile-upcoming-card">
              <h3>Upcoming Activity</h3>
              <div className="vol-profile-upcoming-inner">
                <span className="vol-profile-upcoming-icon" aria-hidden="true">
                  <Trees size={14} />
                </span>
                <div>
                  <span className="vol-profile-tag">TOMORROW</span>
                  <h4>Tree Planting Initiative</h4>
                  <p>09:00 AM - 12:00 PM</p>
                </div>
              </div>
            </article>
          </div>

          <article className="vol-profile-card">
            <div className="vol-profile-card-head">
              <h3>Participation History</h3>
              <button className="vol-profile-text-link" type="button">View All</button>
            </div>
            <div className="vol-profile-history-item">
              <div>
                <h4>City Park Clean-up Drive</h4>
                <p>Led a team of 5 volunteers for waste segregation and collection.</p>
              </div>
              <div className="vol-profile-history-meta">
                <span>OCT 24, 2023</span>
                <strong>+4 Hours</strong>
              </div>
            </div>
          </article>
        </main>
      </section>
    </div>
  );
}
