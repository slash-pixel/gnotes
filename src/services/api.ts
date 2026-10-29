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

  const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Erreur réseau inconnue' }));
    throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
  }

  return response.json();
}

// Télécharge un fichier (ex. Excel) depuis l'API en envoyant le token
export async function downloadFile(endpoint: string, fileName: string) {
  const token = localStorage.getItem('token') || localStorage.getItem('jwt_token');
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Erreur réseau inconnue' }));
    throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
