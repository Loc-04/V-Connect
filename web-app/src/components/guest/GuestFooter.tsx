import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';

import './GuestShared.css';

export function GuestFooter() {
  return (
    <footer className="guest-footer">
      <div className="guest-footer-main">
        <div className="guest-footer-brand">
          <span className="guest-footer-brand-icon" aria-hidden="true">
            <Activity size={16} />
          </span>
          <div>
            <strong>V-Connect</strong>
            <p>Empowering communities through digital volunteer management and smart activity curation.</p>
          </div>
        </div>

        <div className="guest-footer-links">
          <div>
            <span>Company</span>
            <Link to="/#journey">About</Link>
            <Link to="/guest/browse">Browse Activities</Link>
          </div>
          <div>
            <span>Resources</span>
            <Link to="/#top">Product Info</Link>
            <Link to="/#domains">Help Center</Link>
          </div>
          <div>
            <span>Legal</span>
            <a href="#footer">Privacy Policy</a>
            <a href="#footer">Terms of Use</a>
          </div>
          <div>
            <span>Connect</span>
            <a href="#footer">Contact Us</a>
            <a href="#footer">Social Media</a>
          </div>
        </div>
      </div>
      <div className="guest-footer-meta" id="footer">
        <span>© 2024 V-Connect Smart Volunteer Management System. The Digital Curator Editorial.</span>
      </div>
    </footer>
  );
}
