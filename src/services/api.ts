const API_URL = import.meta.env.VITE_API_URL || 'https://note-o1lo.onrender.com/api';

export function setAuthToken(token: string) {
  localStorage.setItem('token', token);
  localStorage.setItem('jwt_token', token);
}

export function clearAuthToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('jwt_token');
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token') || localStorage.getItem('jwt_token');
  const headers = new Headers(options.headers);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Ne remplace pas un en-tête Authorization déjà fourni (ex. token administrateur)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Temporaire : repère l'appel qui part sans token (à retirer ensuite)
  console.log('[API]', endpoint, token ? 'token présent' : '⚠️ PAS DE TOKEN');

  const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Erreur réseau inconnue' }));
    throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
  }

  return response.json();
}