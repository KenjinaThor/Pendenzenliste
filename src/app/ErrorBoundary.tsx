import { Component, type ReactNode } from 'react';

/** Zeigt Fehler lesbar an, statt eine weisse Seite zu hinterlassen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{this.state.error.message}</p>
        <button
          onClick={() => location.reload()}
          className="h-11 rounded-xl bg-brand-600 px-5 font-medium text-white"
        >
          Neu laden
        </button>
      </main>
    );
  }
}
