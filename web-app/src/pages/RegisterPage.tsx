import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { getAuthErrorMessage } from '../auth/authErrors';
import { useAuth } from '../auth/useAuth';
import type { RegisterInput } from '../types/domain';

const initialForm: RegisterInput & { confirmPassword: string } = {
  email: '',
  password: '',
  confirmPassword: '',
  fullName: '',
  phone: '',
  role: 'volunteer',
};

export function RegisterPage() {
  const navigate = useNavigate();
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
        role: form.role,
      });

      if (result.requiresEmailConfirmation) {
        setNotice('Registration complete. Confirm email, then log in.');
        setForm((current) => ({ ...current, password: '', confirmPassword: '' }));
        return;
      }

      if (result.profile?.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
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

        <label className="field-label" htmlFor="role">
          Role
        </label>
        <select
          className="text-input"
          id="role"
          onChange={(event) => handleChange('role', event.target.value as RegisterInput['role'])}
          value={form.role}
        >
          <option value="volunteer">Volunteer</option>
          <option value="organizer">Organizer</option>
        </select>

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

        <p className="muted">
          Have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
