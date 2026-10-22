import { useState, type FormEvent } from 'react';
import { appUrl, supabase } from '../../lib/supabase';

type Step = 'start' | 'code';

export function LoginPage() {
  const [step, setStep] = useState<Step>('start');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: appUrl },
    });
    if (error) setError(error.message);
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: appUrl },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setStep('code');
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) setError('Code ungültig oder abgelaufen.');
  }

  return (
    <main className="mx-auto flex h-full max-w-sm flex-col justify-center gap-6 p-6 pt-[max(1.5rem,var(--safe-top))]">
      <div className="text-center">
        <img
          src={`${import.meta.env.BASE_URL}icon.svg`}
          alt=""
          className="mx-auto h-20 w-20 rounded-3xl shadow-lg"
        />
        <h1 className="mt-4 text-3xl font-bold">Pendenzen</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-300">Bitte melde dich an.</p>
      </div>

      <button
        onClick={signInWithGoogle}
        className="flex h-12 items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 shadow-sm active:bg-slate-100"
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"
          />
          <path
            fill="#FBBC05"
            d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.4 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
          />
        </svg>
        Mit Google anmelden
      </button>

      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="h-px flex-1 bg-slate-300 dark:bg-slate-700" /> oder per E-Mail
        <span className="h-px flex-1 bg-slate-300 dark:bg-slate-700" />
      </div>

      {step === 'start' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label className="sr-only" htmlFor="email">
            E-Mail-Adresse
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="deine@email.ch"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900"
          />
          <button
            disabled={busy}
            className="h-12 rounded-xl bg-brand-600 font-medium text-white active:bg-brand-700 disabled:opacity-60"
          >
            Anmeldecode senden
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Wir haben eine E-Mail an <strong>{email}</strong> gesendet. Gib den Code aus der E-Mail
            ein oder tippe auf den Link darin.
          </p>
          <label className="sr-only" htmlFor="code">
            Anmeldecode
          </label>
          <input
            id="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-center text-xl tracking-widest text-slate-900"
          />
          <button
            disabled={busy}
            className="h-12 rounded-xl bg-brand-600 font-medium text-white active:bg-brand-700 disabled:opacity-60"
          >
            Anmelden
          </button>
          <button
            type="button"
            onClick={() => setStep('start')}
            className="text-sm text-slate-500 underline"
          >
            Andere E-Mail-Adresse verwenden
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </main>
  );
}
