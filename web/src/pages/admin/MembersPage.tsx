import { Link } from 'react-router-dom';

export function MembersPage() {
  return (
    <main className="page">
      <h1>Members</h1>
      <p>Member management and rank controls scaffold.</p>
      <Link to="/admin">Back</Link>
    </main>
  );
}
