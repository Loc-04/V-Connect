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
    <main className="page-wrap">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Admin Login</h1>
        <p className="muted">Use Supabase Auth credentials to access admin pages.</p>

        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          autoComplete="email"
          className="text-input"
          onChange={(event) => setEmail(event.target.value)}
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
          className="text-input"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />

        {(formError || authError) && <p className="form-error">{formError ?? authError}</p>}

        <button className="primary-btn" disabled={submitting} type="submit">
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="muted">
          Need a new account? <Link to="/register">Create one</Link>
        </p>
      </form>
    </main>
  );
}
