import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { getAuthErrorMessage } from '../auth/authErrors';
import { useAuth } from '../auth/useAuth';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithPassword, error: authError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const profile = await signInWithPassword(email.trim(), password);
      const target = (location.state as { from?: string } | null)?.from;

      if (profile.role === 'admin') {
        navigate(target ?? '/admin/dashboard', { replace: true });
        return;
      }

      navigate('/unauthorized', { replace: true });
    } catch (error) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-hero">
        <div className="login-hero-overlay">
          <div className="hero-brand">
            <span className="brand-icon">V</span>
            <span>V-Connect</span>
          </div>
          <h1>Connect volunteers to the right activities</h1>
          <p>
            Join our community to make a real difference. Experience the joy of giving back with a platform designed
            for impact.
          </p>
          <div className="hero-footer">
            <div className="avatar-row">
              <span className="avatar-dot">AL</span>
              <span className="avatar-dot">DK</span>
              <span className="avatar-dot">+2k</span>
            </div>
            <small>Volunteers joined this week</small>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-head">
            <div className="head-icon">
              <span>VC</span>
            </div>
            <h2>Welcome Back</h2>
            <p>Please enter your details to sign in.</p>
          </div>

          <div className="auth-switch">
            <button className="auth-tab active" type="button">
              Login
            </button>
            <Link className="auth-tab" to="/register">
              Register
            </Link>
          </div>

          <label className="field-label" htmlFor="email">
            Email Address
          </label>
          <input
            id="email"
            autoComplete="email"
            className="text-input login-input"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            required
            type="email"
            value={email}
          />

          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            autoComplete="current-password"
            className="text-input login-input"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
            type="password"
            value={password}
          />

          <div className="login-row">
            <label className="remember-row" htmlFor="remember">
              <input
                checked={rememberMe}
                id="remember"
                onChange={(event) => setRememberMe(event.target.checked)}
                type="checkbox"
              />
              <span>Remember me</span>
            </label>
            <button className="link-btn" type="button">
              Forgot Password?
            </button>
          </div>

          {(formError || authError) && <p className="form-error">{formError ?? authError}</p>}

          <button className="primary-btn login-submit" disabled={submitting} type="submit">
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="divider">
            <span>OR CONTINUE WITH</span>
          </div>

          <button className="social-btn" type="button">
            <img
              alt=""
              className="google-icon"
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            />
            <span>Google</span>
          </button>

          <p className="signup-text">
            Don&apos;t have an account? <Link to="/register">Sign up for free</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
