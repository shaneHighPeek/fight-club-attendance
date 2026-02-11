import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/context';
import { auth, db } from '../../services/firebase';

export function AdminHomePage() {
  const { role, user } = useAuth();
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  async function loadWebhookQueue() {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const webhookEvents = collection(db, 'webhookEvents');
      const [pendingSnapshot, completedSnapshot, failedSnapshot] = await Promise.all([
        getCountFromServer(query(webhookEvents, where('status', '==', 'pending'))),
        getCountFromServer(query(webhookEvents, where('status', '==', 'completed'))),
        getCountFromServer(query(webhookEvents, where('status', '==', 'failed'))),
      ]);

      setPendingCount(pendingSnapshot.data().count);
      setCompletedCount(completedSnapshot.data().count);
      setFailedCount(failedSnapshot.data().count);
    } catch (error) {
      console.error(error);
      setQueueError('Unable to load webhook queue status.');
    } finally {
      setLoadingQueue(false);
    }
  }

  useEffect(() => {
    void loadWebhookQueue();
  }, []);

  return (
    <main className="page page-admin">
      <h1>Admin Dashboard</h1>
      <p>Signed in as {user?.email ?? 'unknown'} ({role ?? 'no role'})</p>
      <div className="actions">
        <Link className="button" to="/admin/attendance">Attendance</Link>
        <Link className="button" to="/admin/members">Members</Link>
        <Link className="button" to="/admin/settings">Settings</Link>
        <button className="button button-secondary" onClick={() => signOut(auth)}>Sign Out</button>
      </div>

      <div className="panel">
        <h2>Webhook Queue</h2>
        <p>Monitor outbound CRM sync delivery states.</p>
        <div className="actions">
          <button className="button button-secondary" type="button" onClick={() => void loadWebhookQueue()} disabled={loadingQueue}>
            {loadingQueue ? 'Refreshing...' : 'Refresh Queue'}
          </button>
        </div>
        {queueError ? <p className="error">{queueError}</p> : null}
        {!queueError ? (
          <p>
            Pending: {pendingCount} | Completed: {completedCount} | Failed: {failedCount}
          </p>
        ) : null}
      </div>
    </main>
  );
}
