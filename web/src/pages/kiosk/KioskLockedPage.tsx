import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { functions } from '../../services/firebase';
import { resetFailedLookups, setKioskLocked } from '../../utils/kioskLock';

export function KioskLockedPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlock() {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const callable = httpsCallable<
        { pin: string; locationId: string },
        { ok: boolean; unlockedByRole: 'coach' | 'admin' }
      >(functions, 'unlockKioskWithPin');
      await callable({
        pin: pin.trim(),
        locationId: 'ashmore',
      });
      setKioskLocked(false);
      resetFailedLookups();
      navigate('/kiosk', { replace: true });
    } catch (unlockError) {
      console.error(unlockError);
      setError('Invalid PIN. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page page-kiosk">
      <h1>Kiosk Locked</h1>
      <p>Too many failed lookups. Staff must enter a PIN to unlock.</p>
      <div className="panel">
        <label>
          Staff PIN
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="4 digits"
          />
        </label>
        <div className="actions">
          <button className="button" type="button" onClick={() => void handleUnlock()} disabled={submitting || pin.length !== 4}>
            {submitting ? 'Unlocking...' : 'Unlock Kiosk'}
          </button>
          <Link to="/kiosk">Back</Link>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
