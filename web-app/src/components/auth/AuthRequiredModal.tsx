import { Lock, X } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { GuestProtectedAction } from '../../lib/guestAuth';
import { Button, Card } from '../ui';
import './AuthRequiredModal.css';

interface AuthRequiredModalProps {
  open: boolean;
  onClose: () => void;
  action?: GuestProtectedAction;
  nextPath?: string;
}

function getCopy(action: GuestProtectedAction | undefined) {
  if (action === 'join') {
    return 'You need an account to continue. Log in or sign up to join this activity and start making an impact in your community.';
  }
  if (action === 'save') {
    return 'Create an account to save this opportunity and come back to it later from your personal workspace.';
  }
  if (action === 'ai_match') {
    return 'Sign in to compare this activity with your skills, interests, and availability using AI-assisted recommendations.';
  }
  if (action === 'contact') {
    return 'Log in or sign up to contact the organizer and ask questions before joining.';
  }
  return 'You need an account to continue with this private action.';
}

export function AuthRequiredModal({ open, onClose, action, nextPath }: AuthRequiredModalProps) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const destination = nextPath ?? currentPath;

  const navigateToAuth = (pathname: '/login' | '/register') => {
    const params = new URLSearchParams();
    params.set('next', destination);
    navigate(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="auth-required-backdrop" role="presentation" onClick={onClose}>
      <Card as="section" aria-modal="true" className="auth-required-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <button aria-label="Close login required dialog" className="auth-required-close" onClick={onClose} type="button">
          <X size={18} />
        </button>

        <div className="auth-required-icon" aria-hidden="true">
          <Lock size={28} />
        </div>

        <div className="auth-required-copy">
          <h3>Login required</h3>
          <p>{getCopy(action)}</p>
        </div>

        <div className="auth-required-actions">
          <Button className="auth-required-login" onClick={() => navigateToAuth('/login')} type="button">
            Log in
          </Button>
          <Button className="auth-required-signup" onClick={() => navigateToAuth('/register')} type="button" variant="secondary">
            Sign up
          </Button>
          <button className="auth-required-guest-btn" onClick={onClose} type="button">
            Continue browsing as guest
          </button>
        </div>
      </Card>
    </div>
  );
}
