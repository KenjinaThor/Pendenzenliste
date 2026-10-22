import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAcceptInvite } from '../../lib/api';

/** Einladungslink (#/einladung/<token>): nimmt die Einladung an und öffnet die Liste. */
export function AcceptInvitePage() {
  const { token } = useParams();
  const accept = useAcceptInvite();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    try {
      localStorage.removeItem('pendingInvite');
    } catch {
      /* ignorieren */
    }
    accept.mutateAsync(token).then(
      (listId) => navigate(`/liste/${listId}`, { replace: true }),
      (e: Error) => setError(e.message),
    );
  }, [token, accept, navigate]);

  return (
    <div className="mx-auto max-w-md p-6 text-center">
      {error ? (
        <>
          <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-800">
            {error}
          </p>
          <Link to="/heute" className="mt-4 inline-block font-medium text-indigo-700 underline">
            Zur Startseite
          </Link>
        </>
      ) : (
        <p className="py-12 text-slate-500">Einladung wird angenommen …</p>
      )}
    </div>
  );
}
