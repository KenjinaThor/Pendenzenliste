import { Route, Routes } from 'react-router-dom';
import { formatDate } from '../lib/format';

function Start() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <img
        src={`${import.meta.env.BASE_URL}icon.svg`}
        alt=""
        className="h-24 w-24 rounded-3xl shadow-lg"
      />
      <h1 className="text-3xl font-bold">Pendenzen</h1>
      <p className="max-w-sm text-slate-600 dark:text-slate-300">
        Die App ist online. Als Nächstes folgen Anmeldung und die Pendenzenliste.
      </p>
      <p className="text-sm text-slate-500">Stand: {formatDate(new Date())}</p>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="*" element={<Start />} />
    </Routes>
  );
}
