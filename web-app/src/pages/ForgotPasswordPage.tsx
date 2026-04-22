import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { getAuthErrorMessage } from '../auth/authErrors';
import { BrandIcon } from '../components/brand';
import { getPasswordResetRedirectUrl } from '../lib/authRedirects';
import { supabase } from '../lib/supabase';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUCCESS_MESSAGE = 'Check your email to reset your password';

export function ForgotPasswordPage() {
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: getPasswordResetRedirectUrl(),
      });

      if (error) {
        throw error;
      }

      setNotice(SUCCESS_MESSAGE);
    } catch (error) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-shell password-shell">
      <section className="login-hero password-hero password-hero-forgot">
        <div className="password-hero-inner">
          <div className="password-hero-copy">
            <div className="hero-brand password-brand">
              <span className="brand-icon">
                <BrandIcon />
              </span>
              <span>V-Connect</span>
            </div>
            <h1>Reconnect with your community.</h1>
            <p>
              Your security is our priority. Follow the steps to regain access to your workspace and team
              conversations.
            </p>
          </div>

          <figure className="password-hero-image-wrap">
            <img
              alt="Workspace decorated with a plant and art frames."
              className="password-hero-image"
              src="https://images.pexels.com/photos/2132891/pexels-photo-2132891.jpeg?auto=compress&cs=tinysrgb&w=800"
            />
          </figure>

          <p className="password-hero-footer">(c) {currentYear} V-Connect Inc. All rights reserved.</p>
        </div>
      </section>

      <section className="login-panel password-panel">
        <form className="login-card password-card" onSubmit={handleSubmit}>
          <div className="login-head password-card-head">
            <h2>Forgot your password?</h2>
            <p>Enter your email and we will send a password reset link.</p>
          </div>

          <label className="field-label" htmlFor="forgotEmail">
            Email Address
          </label>
          <input
            autoComplete="email"
            className="text-input password-input"
            id="forgotEmail"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            required
            type="email"
            value={email}
          />

          {formError && <p className="form-error">{formError}</p>}
          {notice && <p className="form-success">{notice}</p>}

          <button className="primary-btn password-submit" disabled={submitting} type="submit">
            {submitting ? 'Sending...' : 'Send Reset Link'}
          </button>

          <Link className="password-back-link" to="/login">
            {'<- Back to Login'}
          </Link>
        </form>
      </section>
    </main>
  );
}
