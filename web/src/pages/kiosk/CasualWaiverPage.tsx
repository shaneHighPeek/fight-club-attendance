import { Link } from 'react-router-dom';

export function CasualWaiverPage() {
  return (
    <main className="page page-kiosk">
      <h1>Casual Visitor Waiver</h1>
      <p>Waiver + details form scaffold.</p>
      <div className="actions">
        <Link className="button" to="/kiosk/success">Submit Waiver</Link>
        <Link to="/kiosk">Back</Link>
      </div>
    </main>
  );
}
