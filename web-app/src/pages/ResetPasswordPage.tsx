import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { getAuthErrorMessage } from '../auth/authErrors';
import { supabase } from '../lib/supabase';

const MIN_PASSWORD_LENGTH = 6;

function normalizeUrlMessage(message: string): string {
  const normalized = message.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function getUrlAuthError(): string | null {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  const message = searchParams.get('error_description') ?? hashParams.get('error_description');
  if (message) {
    return normalizeUrlMessage(message);
  }

  const fallback = searchParams.get('error') ?? hashParams.get('error');
  if (fallback) {
    return normalizeUrlMessage(fallback);
  }

  return null;
}

function toResetTokenMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase();
  if (
    message.includes('expired') ||
    message.includes('invalid') ||
    message.includes('token') ||
    message.includes('otp') ||
    message.includes('session')
  ) {
    return 'Reset link is invalid or has expired. Please request a new one.';
  }

  return rawMessage;
}

export function ResetPasswordPage() {
  const currentYear = new Date().getFullYear();
  const navigate = useNavigate();
  const redirectTimeoutRef = useRef<number | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [checkingLink, setCheckingLink] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const initializeRecoverySession = async () => {
      setCheckingLink(true);
      setLinkError(null);

      const urlError = getUrlAuthError();
      if (urlError) {
        setLinkError(toResetTokenMessage(urlError));
        setCheckingLink(false);
        return;
      }

      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setLinkError(toResetTokenMessage(error.message));
          setCheckingLink(false);
          return;
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setLinkError('Reset link is invalid or has expired. Please request a new one.');
        setCheckingLink(false);
        return;
      }

      window.history.replaceState({}, document.title, window.location.pathname);
      setCheckingLink(false);
    };

    void initializeRecoverySession();

    return () => {
      if (redirectTimeoutRef.current !== null) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (checkingLink || linkError) {
      return;
    }

    setFormError(null);
    setNotice(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Password confirmation does not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const mapped = toResetTokenMessage(error.message);
        if (mapped !== error.message) {
          setLinkError(mapped);
          return;
        }
        throw error;
      }

      setNotice('Password reset successful. Redirecting to login...');
      redirectTimeoutRef.current = window.setTimeout(() => {
        void (async () => {
          await supabase.auth.signOut();
          navigate('/login', { replace: true });
        })();
      }, 1400);
    } catch (error) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-shell password-shell">
      <section className="login-hero password-hero password-hero-reset">
        <div className="password-hero-inner">
          <div className="password-hero-copy">
            <div className="hero-brand password-brand">
              <span className="brand-icon">
                <Activity size={16} />
              </span>
              <span>V-Connect</span>
            </div>
            <h1>Empowering communities together.</h1>
            <p>
              Manage volunteers, track impact, and scale social initiatives with the world's most intuitive
              platform.
            </p>
          </div>

          <figure className="password-hero-image-wrap">
            <img
              alt="Volunteers planting a seedling."
              className="password-hero-image"
              src="https://images.pexels.com/photos/6647043/pexels-photo-6647043.jpeg?auto=compress&cs=tinysrgb&w=800"
            />
          </figure>

          <p className="password-hero-footer">(c) {currentYear} V-Connect Platform. All rights reserved.</p>
        </div>
      </section>

      <section className="login-panel password-panel">
        <form className="login-card password-card" onSubmit={handleSubmit}>
          <div className="login-head password-card-head">
            <h2>Reset your password</h2>
            <p>Enter a new password for your account.</p>
          </div>

          {checkingLink && <p className="password-note">Verifying reset link...</p>}
          {linkError && <p className="form-error">{linkError}</p>}

          {!checkingLink && !linkError && (
            <>
              <label className="field-label" htmlFor="newPassword">
                New Password
              </label>
              <input
                autoComplete="new-password"
                className="text-input password-input"
                id="newPassword"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                required
                type="password"
                value={password}
              />

              <label className="field-label" htmlFor="confirmNewPassword">
                Confirm Password
              </label>
              <input
                autoComplete="new-password"
                className="text-input password-input"
                id="confirmNewPassword"
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="********"
                required
                type="password"
                value={confirmPassword}
              />

              {formError && <p className="form-error">{formError}</p>}
              {notice && <p className="form-success">{notice}</p>}

              <button className="primary-btn password-submit" disabled={submitting} type="submit">
                {submitting ? 'Resetting...' : 'Reset Password'}
              </button>
            </>
          )}

          <div className="password-links">
            {linkError && (
              <Link className="password-back-link" to="/forgot-password">
                Request New Reset Link
              </Link>
            )}
            <Link className="password-back-link" to="/login">
              {'<- Back to Login'}
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
