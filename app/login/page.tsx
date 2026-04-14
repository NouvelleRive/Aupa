'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get('next') || '/';
      window.location.href = next;
    } else {
      setError('Mot de passe incorrect');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-yellow-50">
      <form onSubmit={submit} className="bg-white p-8 rounded-2xl shadow-sm border border-yellow-200 w-80">
        <h1 className="text-2xl font-bold mb-1">Aupa</h1>
        <p className="text-sm text-gray-500 mb-6">Accès protégé</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-yellow-400"
        />
        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-semibold rounded-lg py-2"
        >
          {loading ? '...' : 'Entrer'}
        </button>
      </form>
    </div>
  );
}
