// src/services/api.ts
const API_URL = import.meta.env.VITE_API_URL || 'https://note-o1lo.onrender.com/api';

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  // Récupération du token en vérifiant les deux clés pour une compatibilité totale
  const token = localStorage.getItem('token') || localStorage.getItem('jwt_token');
  
  // Utilisation de l'objet Headers pour fusionner et transmettre proprement les en-têtes
  const headers = new Headers(options.headers);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Erreur réseau inconnue' }));
    throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
  }

  return response.json();
}