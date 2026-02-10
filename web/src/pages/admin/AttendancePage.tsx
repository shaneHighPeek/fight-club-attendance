import { Link } from 'react-router-dom';

export function AttendancePage() {
  return (
    <main className="page">
      <h1>Attendance</h1>
      <p>Filters, summaries, and export scaffold.</p>
      <Link to="/admin">Back</Link>
    </main>
  );
}
