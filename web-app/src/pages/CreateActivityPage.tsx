import './CreateActivityPage.css';

const skills = ['Leadership', 'Teaching'];

export function CreateActivityPage() {
  return (
    <div className="create-activity-page">
      <header className="create-activity-header">
        <div className="create-activity-header__container">
          <div className="create-activity-brand">
            <span className="create-activity-brand__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img">
                <path d="M12 3.2c-3.7 0-6.8 2.1-6.8 4.7 0 1 .5 1.9 1.3 2.7-.8.8-1.3 1.7-1.3 2.7 0 1.1.6 2.1 1.6 2.9-.6.7-1 1.5-1 2.3 0 2.6 3 4.7 6.8 4.7s6.8-2.1 6.8-4.7c0-.8-.3-1.6-1-2.3 1-.8 1.6-1.8 1.6-2.9 0-1-.5-1.9-1.3-2.7.8-.8 1.3-1.7 1.3-2.7 0-2.6-3-4.7-6.8-4.7Z" />
              </svg>
            </span>
            <strong>V-Connect</strong>
          </div>

          <nav className="create-activity-nav" aria-label="Main">
            <a href="#" className="create-activity-nav__item">Dashboard</a>
            <a href="#" className="create-activity-nav__item is-active">Activities</a>
            <a href="#" className="create-activity-nav__item">Volunteers</a>
            <a href="#" className="create-activity-nav__item">Reports</a>
          </nav>

          <div className="create-activity-header__actions">
            <button className="create-activity-profile-btn" type="button">Profile</button>
            <span className="create-activity-avatar" aria-hidden="true" />
          </div>
        </div>
      </header>

      <main className="create-activity-main">
        <div className="create-activity-content">
          <div className="create-activity-breadcrumbs">
            <span>Home</span>
            <span aria-hidden="true">/</span>
            <span>Activities</span>
            <span aria-hidden="true">/</span>
            <strong>Create</strong>
          </div>

          <section className="create-activity-title">
            <h1>Create New Activity</h1>
            <p>
              Fill in the details below to launch a new volunteering opportunity and connect with
              the community.
            </p>
          </section>

          <form className="create-activity-form" onSubmit={(event) => event.preventDefault()}>
            <section className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-blue" aria-hidden="true">B</span>
                <h2>Basic Information</h2>
              </div>

              <label className="activity-field">
                <span>Activity Title</span>
                <input type="text" placeholder="e.g., Weekend Beach Cleanup" />
              </label>

              <label className="activity-field">
                <span>Description</span>
                <textarea rows={4} placeholder="Describe the activity, goals, and what volunteers can expect..." />
              </label>

              <div className="activity-field">
                <span>Cover Image</span>
                <button className="activity-upload" type="button">
                  <span className="activity-upload__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" role="img">
                      <path d="M19.5 16v3h-15v-3H3v3.5A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5V16h-1.5Zm-6.75 1h-1.5v-6.19l-2.35 2.34-1.06-1.06L12 7.88l4.16 4.2-1.06 1.06-2.35-2.34V17Z" />
                    </svg>
                  </span>
                  <strong>Upload a file</strong>
                  <p>or drag and drop</p>
                  <small>PNG, JPG, GIF up to 10MB</small>
                </button>
              </div>
            </section>

            <section className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-purple" aria-hidden="true">R</span>
                <h2>Requirements</h2>
              </div>

              <div className="activity-grid two-cols">
                <div className="activity-field">
                  <span>Required Skills</span>
                  <div className="activity-tag-input">
                    {skills.map((skill) => (
                      <button key={skill} className="activity-tag" type="button">
                        {skill} <span aria-hidden="true">x</span>
                      </button>
                    ))}
                    <input type="text" placeholder="Add skill..." />
                  </div>
                </div>

                <div className="activity-field">
                  <span>Priority Level</span>
                  <div className="priority-toggle" role="group" aria-label="Priority level">
                    <button type="button">Low</button>
                    <button className="is-selected" type="button">Normal</button>
                    <button type="button">Urgent</button>
                  </div>
                </div>
              </div>
            </section>

            <section className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-orange" aria-hidden="true">L</span>
                <h2>Logistics</h2>
              </div>

              <div className="activity-grid three-cols">
                <label className="activity-field">
                  <span>Date</span>
                  <input type="text" placeholder="mm/dd/yyyy" />
                </label>
                <label className="activity-field">
                  <span>Start Time</span>
                  <input type="text" placeholder="--:-- --" />
                </label>
                <label className="activity-field">
                  <span>End Time</span>
                  <input type="text" placeholder="--:-- --" />
                </label>
              </div>

              <div className="activity-grid two-cols is-wide-first">
                <label className="activity-field">
                  <span>Location</span>
                  <input type="text" placeholder="Search for a location or address" />
                </label>
                <label className="activity-field">
                  <span>Volunteer Capacity</span>
                  <input type="number" min={0} placeholder="0" />
                </label>
              </div>

              <div className="map-preview" aria-hidden="true">
                <span>Map Preview</span>
              </div>
            </section>

            <div className="activity-action-bar">
              <button className="action-btn is-ghost" type="button">Cancel</button>
              <div className="activity-action-bar__right">
                <button className="action-btn is-secondary" type="button">Save Draft</button>
                <button className="action-btn is-primary" type="submit">Save &amp; Publish</button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
