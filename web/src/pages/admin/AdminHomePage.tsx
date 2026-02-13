import { collection, getCountFromServer, getDocs, limit, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/context';
import { auth, db, functions } from '../../services/firebase';

interface FailedWebhookEventRow {
  id: string;
  eventType: string;
  memberId: string;
  attempts: number;
  error: string;
  updatedAtText: string;
}

export function AdminHomePage() {
  const { role, user } = useAuth();
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [failedRows, setFailedRows] = useState<FailedWebhookEventRow[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  function timestampToText(value: unknown) {
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
      const date = value.toDate() as Date;
      return date.toLocaleString();
    }
    return 'n/a';
  }

  async function loadWebhookQueue() {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const webhookEvents = collection(db, 'webhookEvents');
      const [pendingSnapshot, completedSnapshot, failedSnapshot, failedDocsSnapshot] = await Promise.all([
        getCountFromServer(query(webhookEvents, where('status', '==', 'pending'))),
        getCountFromServer(query(webhookEvents, where('status', '==', 'completed'))),
        getCountFromServer(query(webhookEvents, where('status', '==', 'failed'))),
        getDocs(query(webhookEvents, where('status', '==', 'failed'), limit(20))),
      ]);

      setPendingCount(pendingSnapshot.data().count);
      setCompletedCount(completedSnapshot.data().count);
      setFailedCount(failedSnapshot.data().count);
      const rows = failedDocsSnapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return {
          id: docSnap.id,
          eventType: typeof data.eventType === 'string' ? data.eventType : 'unknown',
          memberId: typeof data.memberId === 'string' ? data.memberId : '-',
          attempts: typeof data.attempts === 'number' ? data.attempts : 0,
          error: typeof data.error === 'string' ? data.error : 'Unknown error',
          updatedAtText: timestampToText(data.updatedAt),
        };
      });
      setFailedRows(rows);
    } catch (error) {
      console.error(error);
      setQueueError('Unable to load webhook queue status.');
      setFailedRows([]);
    } finally {
      setLoadingQueue(false);
    }
  }

  async function handleRetry(eventId: string) {
    setRetryingId(eventId);
    setQueueError(null);
    try {
      const callable = httpsCallable<{ eventId: string; force?: boolean }, { ok: boolean }>(
        functions,
        'retryWebhookEvent',
      );
      await callable({ eventId });
      await loadWebhookQueue();
    } catch (error) {
      console.error(error);
      setQueueError('Retry failed. Check role permissions and function logs.');
    } finally {
      setRetryingId(null);
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
        {failedRows.length > 0 ? (
          <div className="table-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>Event Type</th>
                  <th>Member</th>
                  <th>Attempts</th>
                  <th>Updated</th>
                  <th>Error</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {failedRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.eventType}</td>
                    <td>{row.memberId}</td>
                    <td>{row.attempts}</td>
                    <td>{row.updatedAtText}</td>
                    <td>{row.error}</td>
                    <td>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => void handleRetry(row.id)}
                        disabled={retryingId === row.id}
                      >
                        {retryingId === row.id ? 'Retrying...' : 'Retry'}
                      </button>
                    </td>
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
