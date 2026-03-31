import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button, Card } from '../ui';
import './AuthRequiredModal.css';

interface AuthRequiredModalProps {
  open: boolean;
  onClose: () => void;
  intent?: 'register' | 'private_action';
}

export function AuthRequiredModal({ open, onClose, intent = 'private_action' }: AuthRequiredModalProps) {
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

  const navigateToAuth = (pathname: '/login' | '/register') => {
    const params = new URLSearchParams();
    params.set('next', currentPath);
    if (intent === 'register') {
      params.set('intent', 'register');
    }
    navigate(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="auth-required-backdrop" role="presentation" onClick={onClose}>
      <Card
        as="section"
        aria-modal="true"
        className="auth-required-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h3>You need an account to continue</h3>
        <p className="muted">Sign in or create an account to join this activity.</p>

        <div className="auth-required-actions">
          <Button onClick={() => navigateToAuth('/login')} type="button">
            Sign In
          </Button>
          <Button onClick={() => navigateToAuth('/register')} type="button" variant="secondary">
            Sign Up
          </Button>
          <Button onClick={onClose} type="button" variant="secondary">
            Stay as Guest
          </Button>
        </div>
      </Card>
    </div>
  );
}
