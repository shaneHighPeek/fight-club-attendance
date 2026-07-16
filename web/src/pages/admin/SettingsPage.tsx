import { collection, getDocs, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/context';
import { db, functions } from '../../services/firebase';

type StaffRole = 'admin' | 'manager' | 'coach' | 'member';

interface StaffUserRow {
  uid: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
}

export function SettingsPage() {
  const { role: authRole, user } = useAuth();
  const [staffUsers, setStaffUsers] = useState<StaffUserRow[]>([]);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createRole, setCreateRole] = useState<StaffRole>('coach');
  const [resetPasswordEmail, setResetPasswordEmail] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<StaffRole>('coach');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [changingOwnPassword, setChangingOwnPassword] = useState(false);
  const [coachPin, setCoachPin] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [savingPins, setSavingPins] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadStaffUsers() {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDocs(query(collection(db, 'staffUsers')));
      const rows: StaffUserRow[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const nextRole =
          data.role === 'admin' || data.role === 'manager' || data.role === 'coach' || data.role === 'member'
            ? data.role
            : 'member';
        return {
          uid: docSnap.id,
          email: typeof data.email === 'string' ? data.email : 'unknown',
          role: nextRole,
          isActive: data.isActive === true,
        };
      });
      rows.sort((a, b) => a.email.localeCompare(b.email));
      setStaffUsers(rows);
    } catch (loadError) {
      console.error(loadError);
      setError('Failed to load staff role settings.');
      setStaffUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStaffUsers();
  }, []);

  async function handleAssignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const callable = httpsCallable<{ email: string; role: StaffRole }, { ok: boolean }>(functions, 'setStaffRole');
      await callable({
        email: email.trim().toLowerCase(),
        role: selectedRole,
      });
      setMessage('Role updated. User must refresh sign-in token (sign out/in) to apply new permissions.');
      await loadStaffUsers();
      setEmail('');
      setSelectedRole('coach');
    } catch (saveError) {
      console.error(saveError);
      setError('Failed to update role. Ensure target user exists in Firebase Auth and you are admin.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateStaffUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const callable = httpsCallable<
        { email: string; password: string; displayName: string; role: StaffRole },
        { ok: boolean }
      >(functions, 'createStaffUser');

      await callable({
        email: createEmail.trim().toLowerCase(),
        password: createPassword,
        displayName: createDisplayName.trim(),
        role: createRole,
      });

      setMessage('Staff user created with role claim. Ask them to sign in with the provided password.');
      await loadStaffUsers();
      setCreateEmail('');
      setCreatePassword('');
      setCreateDisplayName('');
      setCreateRole('coach');
    } catch (createError) {
      console.error(createError);
      setError('Failed to create staff user. Check email format and password length (min 6).');
    } finally {
      setCreating(false);
    }
  }

  async function handleSavePins(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPins(true);
    setError(null);
    setMessage(null);
    try {
      const callable = httpsCallable<{ coachPin: string; adminPin: string }, { ok: boolean }>(
        functions,
        'setKioskPins',
      );
      await callable({
        coachPin: coachPin.trim(),
        adminPin: adminPin.trim(),
      });
      setMessage('Kiosk PINs updated.');
      setCoachPin('');
      setAdminPin('');
    } catch (pinError) {
      console.error(pinError);
      setError('Failed to save kiosk PINs. Use 4 digits for each PIN.');
    } finally {
      setSavingPins(false);
    }
  }

  async function handleResetStaffPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResettingPassword(true);
    setError(null);
    setMessage(null);
    try {
      const callable = httpsCallable<{ email: string; newPassword: string }, { ok: boolean }>(
        functions,
        'setStaffPassword',
      );
      await callable({
        email: resetPasswordEmail.trim().toLowerCase(),
        newPassword: resetPasswordValue,
      });
      setMessage('Password reset applied for that user.');
      setResetPasswordEmail('');
      setResetPasswordValue('');
    } catch (passwordResetError) {
      console.error(passwordResetError);
      setError('Failed to reset password. You must be admin, and password must be at least 6 characters.');
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleChangeMyPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChangingOwnPassword(true);
    setError(null);
    setMessage(null);
    try {
      if (!user || !user.email) {
        throw new Error('No signed-in user context.');
      }

      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setMessage('Your password has been updated.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (changePasswordError) {
      console.error(changePasswordError);
      setError('Could not change password. Confirm your current password and try again.');
    } finally {
      setChangingOwnPassword(false);
    }
  }

  return (
    <main className="page page-admin">
      <h1>Settings</h1>
      <p>Assign staff roles and review current access configuration.</p>
      <div className="actions">
        <Link to="/admin">Back</Link>
      </div>

      <form className="panel" onSubmit={handleCreateStaffUser}>
        <h2>Create Staff User</h2>
        <label>
          Email
          <input
            type="email"
            value={createEmail}
            onChange={(event) => setCreateEmail(event.target.value)}
            placeholder="new.staff@example.com"
            required
          />
        </label>
        <label>
          Temporary password
          <input
            type="password"
            value={createPassword}
            onChange={(event) => setCreatePassword(event.target.value)}
            placeholder="Minimum 6 characters"
            minLength={6}
            required
          />
        </label>
        <label>
          Display name (optional)
          <input
            type="text"
            value={createDisplayName}
            onChange={(event) => setCreateDisplayName(event.target.value)}
            placeholder="Coach Mike"
          />
        </label>
        <label>
          Initial role
          <select value={createRole} onChange={(event) => setCreateRole(event.target.value as StaffRole)}>
            <option value="coach">coach</option>
            <option value="manager">manager</option>
            <option value="admin">admin</option>
            <option value="member">member</option>
          </select>
        </label>
        <button className="button" type="submit" disabled={creating}>
          {creating ? 'Creating...' : 'Create Staff User'}
        </button>
      </form>

      <form className="panel" onSubmit={handleAssignRole}>
        <h2>Assign Role</h2>
        <label>
          User email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="coach@example.com"
            required
          />
        </label>
        <label>
          Role
          <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as StaffRole)}>
            <option value="coach">coach</option>
            <option value="manager">manager</option>
            <option value="admin">admin</option>
            <option value="member">member (remove staff access)</option>
          </select>
        </label>
        <button className="button" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Role'}
        </button>
      </form>

      <form className="panel" onSubmit={handleSavePins}>
        <h2>Kiosk PINs</h2>
        <p>Set shared 4-digit coach and admin PINs used to unlock kiosk lock state.</p>
        <label>
          Coach PIN (4 digits)
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={coachPin}
            onChange={(event) => setCoachPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="0000"
            required
          />
        </label>
        <label>
          Admin PIN (4 digits)
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={adminPin}
            onChange={(event) => setAdminPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="0000"
            required
          />
        </label>
        <button className="button" type="submit" disabled={savingPins || coachPin.length !== 4 || adminPin.length !== 4}>
          {savingPins ? 'Saving PINs...' : 'Save Kiosk PINs'}
        </button>
      </form>

      <form className="panel" onSubmit={handleChangeMyPassword}>
        <h2>Change My Password</h2>
        <p>Update the current signed-in account password.</p>
        <label>
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            minLength={6}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={6}
            required
          />
        </label>
        <button className="button" type="submit" disabled={changingOwnPassword}>
          {changingOwnPassword ? 'Updating password...' : 'Update My Password'}
        </button>
      </form>

      {authRole === 'admin' ? (
        <form className="panel" onSubmit={handleResetStaffPassword}>
          <h2>Reset Staff Password</h2>
          <p>Admin-only: set a new password for any staff account.</p>
          <label>
            Staff email
            <input
              type="email"
              value={resetPasswordEmail}
              onChange={(event) => setResetPasswordEmail(event.target.value)}
              placeholder="coach@example.com"
              required
            />
          </label>
          <label>
            New temporary password
            <input
              type="password"
              value={resetPasswordValue}
              onChange={(event) => setResetPasswordValue(event.target.value)}
              minLength={6}
              placeholder="Minimum 6 characters"
              required
            />
          </label>
          <button className="button" type="submit" disabled={resettingPassword}>
            {resettingPassword ? 'Resetting...' : 'Reset Staff Password'}
          </button>
        </form>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {message ? <p>{message}</p> : null}

      <div className="panel table-panel">
        <h2>Current Staff Roles</h2>
        <div className="actions">
          <button className="button button-secondary" type="button" onClick={() => void loadStaffUsers()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh Staff List'}
          </button>
        </div>
        {staffUsers.length === 0 && !loading ? <p>No staff role records yet.</p> : null}
        {staffUsers.length > 0 ? (
          <div className="table-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>UID</th>
                </tr>
              </thead>
              <tbody>
                {staffUsers.map((row) => (
                  <tr key={row.uid}>
                    <td>{row.email}</td>
                    <td>{row.role}</td>
                    <td>{row.isActive ? 'Active' : 'Inactive'}</td>
                    <td>{row.uid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </main>
  );
}
