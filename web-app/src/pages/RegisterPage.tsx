import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { getAuthErrorMessage } from '../auth/authErrors';
import { canRoleAccessPath, getRoleHomePath } from '../auth/rolePaths';
import { useAuth } from '../auth/useAuth';
import type { RegisterInput } from '../types/domain';

const PUBLIC_SIGNUP_ROLE: RegisterInput['role'] = 'volunteer';
const initialForm: RegisterInput & { confirmPassword: string } = {
  email: '',
  password: '',
  confirmPassword: '',
  fullName: '',
  phone: '',
  role: PUBLIC_SIGNUP_ROLE,
};
const GUEST_ENTRY_LABEL = 'Continue as Guest';

function resolveSafeNextPath(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  return value;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register } = useAuth();

  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleChange = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    if (form.password !== form.confirmPassword) {
      setFormError('Password confirmation does not match.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await register({
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        role: PUBLIC_SIGNUP_ROLE,
      });

      if (result.requiresEmailConfirmation) {
        setNotice('Registration complete. Confirm email, then log in.');
        setForm((current) => ({ ...current, password: '', confirmPassword: '' }));
        return;
      }

      if (result.profile) {
        const queryTarget = resolveSafeNextPath(new URLSearchParams(location.search).get('next'));
        const stateTarget = resolveSafeNextPath((location.state as { from?: string } | null)?.from);
        const candidateTarget = queryTarget ?? stateTarget;
        const target = canRoleAccessPath(result.profile.role, candidateTarget) ? candidateTarget : null;

        navigate(target ?? getRoleHomePath(result.profile.role), { replace: true });
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
        <h1>Register</h1>
        <p className="muted">Create account with Supabase Auth.</p>

        <label className="field-label" htmlFor="fullName">
          Full name
        </label>
        <input
          id="fullName"
          className="text-input"
          onChange={(event) => handleChange('fullName', event.target.value)}
          required
          value={form.fullName}
        />

        <label className="field-label" htmlFor="phone">
          Phone
        </label>
        <input
          id="phone"
          className="text-input"
          onChange={(event) => handleChange('phone', event.target.value)}
          required
          value={form.phone}
        />

        <label className="field-label" htmlFor="publicRole">
          Role
        </label>
        <input
          className="text-input"
          id="publicRole"
          readOnly
          value="Volunteer"
        />
        <p className="muted">Organizer accounts are not available through public self-signup.</p>

        <label className="field-label" htmlFor="registerEmail">
          Email
        </label>
        <input
          id="registerEmail"
          autoComplete="email"
          className="text-input"
          onChange={(event) => handleChange('email', event.target.value)}
          required
          type="email"
          value={form.email}
        />

        <label className="field-label" htmlFor="registerPassword">
          Password
        </label>
        <input
          id="registerPassword"
          autoComplete="new-password"
          className="text-input"
          onChange={(event) => handleChange('password', event.target.value)}
          required
          type="password"
          value={form.password}
        />

        <label className="field-label" htmlFor="confirmPassword">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          autoComplete="new-password"
          className="text-input"
          onChange={(event) => handleChange('confirmPassword', event.target.value)}
          required
          type="password"
          value={form.confirmPassword}
        />

        {formError && <p className="form-error">{formError}</p>}
        {notice && <p className="form-success">{notice}</p>}

        <button className="primary-btn" disabled={submitting} type="submit">
          {submitting ? 'Creating...' : 'Create account'}
        </button>
        <button className="secondary-btn" onClick={() => navigate('/', { replace: true })} type="button">
          {GUEST_ENTRY_LABEL}
        </button>

        <p className="muted">
          Have an account? <Link to={`/login${location.search}`}>Sign in</Link>
        </p>
      </form>
    </main>
  );
}
