import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { getAuthErrorMessage } from '../auth/authErrors';
import { getRoleHomePath } from '../auth/rolePaths';
import { useAuth } from '../auth/useAuth';

const heroSlides = [
  {
    image: 'https://images.pexels.com/photos/6646918/pexels-photo-6646918.jpeg?auto=compress&cs=tinysrgb&w=1600',
    title: 'Connect volunteers to the right activities',
    description:
      'Join our community to make a real difference. Experience the joy of giving back with a platform designed for impact.',
    stat: 'Volunteers joined this week',
    badges: ['AL', 'DK', '+2k'],
  },
  {
    image: 'https://images.pexels.com/photos/6994985/pexels-photo-6994985.jpeg?auto=compress&cs=tinysrgb&w=1600',
    title: 'Coordinate events with clarity and speed',
    description:
      'Track registrations, assign roles, and monitor participation in one workflow built for organizers and community teams.',
    stat: 'Events managed this month',
    badges: ['HQ', 'TN', '+48'],
  },
  {
    image: 'https://images.pexels.com/photos/6646914/pexels-photo-6646914.jpeg?auto=compress&cs=tinysrgb&w=1600',
    title: 'Turn participation data into community growth',
    description:
      'Build trust with transparent reports, real attendance data, and insights that help every activity create stronger outcomes.',
    stat: 'Hours contributed this quarter',
    badges: ['BD', 'MP', '+890'],
  },
];

const HERO_ROTATE_INTERVAL_MS = 6000;
const HERO_FADE_MS = 900;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithPassword, error: authError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [previousSlideIndex, setPreviousSlideIndex] = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const currentSlide = heroSlides[slideIndex];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSlideIndex((current) => {
        setPreviousSlideIndex(current);
        setTransitioning(true);
        return (current + 1) % heroSlides.length;
      });
    }, HERO_ROTATE_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!transitioning) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTransitioning(false);
      setPreviousSlideIndex(null);
    }, HERO_FADE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [transitioning]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const profile = await signInWithPassword(email.trim(), password);
      const target = (location.state as { from?: string } | null)?.from;
      const roleHome = getRoleHomePath(profile.role);

      if (target && profile.role === 'admin') {
        navigate(target, { replace: true });
        return;
      }

      navigate(roleHome, { replace: true });
    } catch (error) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-hero">
        {transitioning && previousSlideIndex !== null && (
          <div
            className="hero-bg-layer hero-bg-previous"
            style={{ backgroundImage: `url('${heroSlides[previousSlideIndex].image}')` }}
          />
        )}
        <div
          className="hero-bg-layer hero-bg-current"
          key={`hero-bg-${slideIndex}`}
          style={{ backgroundImage: `url('${currentSlide.image}')` }}
        />

        <div className="login-hero-overlay" key={`hero-content-${slideIndex}`}>
          <div className="hero-brand">
            <span className="brand-icon">V</span>
            <span>V-Connect</span>
          </div>
          <h1>{currentSlide.title}</h1>
          <p>{currentSlide.description}</p>
          <div className="hero-footer">
            <div className="avatar-row">
              {currentSlide.badges.map((badge) => (
                <span className="avatar-dot" key={badge}>
                  {badge}
                </span>
              ))}
            </div>
            <small>{currentSlide.stat}</small>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-head">
            <div className="login-brand-title">V-Connect</div>
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
            <Link className="link-btn" to="/forgot-password">
              Forgot Password?
            </Link>
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
