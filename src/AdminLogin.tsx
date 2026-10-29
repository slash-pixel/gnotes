import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { fetchApi, setAuthToken } from './services/api';

interface AdminLoginProps {
  onSuccess: () => void;
  onBack: () => void;
}

interface AdminLoginResponse {
  token: string;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onSuccess, onBack }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchApi('/dashboard/login', {
        method: 'POST',
        body: JSON.stringify({ mot_de_passe: password })
      }) as AdminLoginResponse;

      if (!res.token) throw new Error('Aucun token reçu du serveur.');
      setAuthToken(res.token);
      onSuccess();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Connexion impossible. Vérifiez vos identifiants.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1F4B] flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-[#0B1F4B] text-white p-6 border-b-4 border-[#C9A227]">
          <h1 className="font-serif text-lg font-bold text-[#C9A227]">Collège Catholique Saint Charles Borromée</h1>
          <p className="text-xs text-blue-200 mt-1">Espace administration</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="text-xs font-medium text-[#0B1F4B] hover:underline flex items-center mb-4 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              <span>Retour à la saisie des notes</span>
            </button>
            <h2 className="font-serif text-2xl font-bold text-[#0B1F4B]">Accès à l’administration</h2>
            <p className="text-sm text-gray-500 mt-1">Accédez aux fichiers de notes et téléchargez-les en Excel.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="admin-password" className="text-sm font-bold text-[#0B1F4B] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#C9A227]" />
              <span>Mot de passe</span>
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mot de passe"
                className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#C9A227] text-sm text-slate-800"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-200" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md ${
              password && !loading
                ? 'bg-[#C9A227] hover:bg-[#b08e20] text-[#0B1F4B] cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Se connecter</span>
          </button>
        </form>
      </div>
    </div>
  );
};
