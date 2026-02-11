import { useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

interface SuccessState {
  memberName?: string;
  streakWeeks?: number;
  daysAway?: number;
  returningAfterBreak?: boolean;
}

export function KioskSuccessPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as SuccessState | null;
  const memberName = state?.memberName ?? 'Champion';
  const streakWeeks = typeof state?.streakWeeks === 'number' ? state.streakWeeks : 0;
  const daysAway = typeof state?.daysAway === 'number' ? state.daysAway : 0;
  const returningAfterBreak = state?.returningAfterBreak === true;
  const confettiPieces = useMemo(
    () => Array.from({ length: 42 }, (_, index) => ({ id: index, left: `${(index * 13) % 100}%`, delay: `${(index % 7) * 80}ms` })),
    [],
  );

  useEffect(() => {
    const audio = new Audio('/ouse.mp3');
    void audio.play().catch(() => undefined);

    const timerId = window.setTimeout(() => {
      navigate('/kiosk', { replace: true });
    }, 3500);

    return () => {
      audio.pause();
      window.clearTimeout(timerId);
    };
  }, [navigate]);

  return (
    <main className="page page-kiosk">
      <div className="confetti-burst" aria-hidden>
        {confettiPieces.map((piece) => (
          <span key={piece.id} className="confetti-piece" style={{ left: piece.left, animationDelay: piece.delay }} />
        ))}
      </div>
      <h1>You&apos;re Checked In</h1>
      <p>
        Congratulations {memberName}, you&apos;ve now completed {streakWeeks} week{streakWeeks === 1 ? '' : 's'} in a row. Way to go!
      </p>
      {returningAfterBreak ? (
        <p>
          Welcome back. Great consistency reset after {daysAway} days away.
        </p>
      ) : null}
      <p>Returning to home in 3.5 seconds...</p>
      <Link className="button" to="/kiosk">Return Home</Link>
    </main>
  );
}
