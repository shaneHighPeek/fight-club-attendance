import { useState, type FormEvent } from 'react';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

import { auth } from '../../services/firebase';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError('Sign-in failed. Check your email/password and try again.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendResetEmail() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your admin email first, then use reset password.');
      setMessage(null);
      return;
    }

    setSendingReset(true);
    setError(null);
    setMessage(null);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setMessage('Password reset email sent. Check your inbox and spam folder.');
    } catch (err) {
      setError('Could not send reset email. Verify the email and try again.');
      console.error(err);
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <main className="page page-admin">
      <h1>Admin Login</h1>
      <form className="panel" onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
        <button className="button button-secondary" type="button" onClick={() => void handleSendResetEmail()} disabled={sendingReset}>
          {sendingReset ? 'Sending reset...' : 'Forgot Password'}
        </button>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p>{message}</p> : null}
      </form>
    </main>
  );
}
