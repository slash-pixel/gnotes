const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://note-o1lo.onrender.com/api'
).replace(/\/$/, '');

export function setAuthToken(token: string) {
  localStorage.setItem('token', token);
  localStorage.setItem('jwt_token', token);
}

export function clearAuthToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('jwt_token');
}

export async function fetchApi(
  endpoint: string,
  options: RequestInit = {}
) {
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('jwt_token');

  const headers = new Headers(options.headers);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Conserver le token explicitement fourni par l'appelant.
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const cleanEndpoint = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;

  const response = await fetch(`${API_URL}${cleanEndpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    throw new Error(
      errorData.error ||
      errorData.message ||
      `Erreur HTTP ${response.status}`
    );
  }

  return response.json();
}

export async function downloadFile(
  endpoint: string,
  fileName: string
) {
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('jwt_token');

  const cleanEndpoint = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;

  const response = await fetch(`${API_URL}${cleanEndpoint}`, {
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : {}
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    throw new Error(
      errorData.error ||
      errorData.message ||
      `Erreur HTTP ${response.status}`
    );
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