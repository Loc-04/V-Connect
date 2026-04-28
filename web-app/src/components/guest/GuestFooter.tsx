import { Link } from 'react-router-dom';
import { BrandIcon } from '../brand';
import './GuestShared.css';

export function GuestFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="guest-footer">
      <div className="guest-footer-main">
        <div className="guest-footer-brand">
          <span className="guest-footer-brand-icon" aria-hidden="true">
            <BrandIcon />
          </span>
          <div>
            <strong>V-Connect</strong>
            <p>Empowering communities through digital volunteer management and smart activity curation.</p>
          </div>
        </div>

        <div className="guest-footer-links">
          <div>
            <span>Company</span>
            <Link to="/about">About</Link>
            <Link to="/guest/browse">Browse Activities</Link>
          </div>
          <div>
            <span>Resources</span>
            <Link to="/#top">Product Info</Link>
            <Link to="/#domains">Help Center</Link>
          </div>
          <div>
            <span>Legal</span>
            <span className="guest-footer-link-disabled" aria-disabled="true">
              Privacy Policy (Coming soon)
            </span>
            <span className="guest-footer-link-disabled" aria-disabled="true">
              Terms of Use (Coming soon)
            </span>
          </div>
          <div>
            <span>Connect</span>
            <span className="guest-footer-link-disabled" aria-disabled="true">
              Contact Us (Coming soon)
            </span>
            <span className="guest-footer-link-disabled" aria-disabled="true">
              Social Media (Coming soon)
            </span>
          </div>
        </div>
      </div>
      <div className="guest-footer-meta" id="footer">
        <span>© {currentYear} V-Connect Smart Volunteer Management System. The Digital Curator Editorial.</span>
      </div>
    </footer>
  );
}

