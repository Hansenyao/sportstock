import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// Module-level token store — updated by AuthContext on every state change.
// Avoids circular imports between context and api files.
let _token: string | null = null;

export function setToken(t: string | null) { _token = t; }
export function getToken() { return _token; }

const client = axios.create({ baseURL: BASE });

client.interceptors.request.use(cfg => {
  if (_token) cfg.headers.Authorization = `Bearer ${_token}`;
  return cfg;
});

client.interceptors.response.use(
  res => res,
  err => {
    const url: string = (err.config?.url as string) ?? '';
    if (err.response?.status === 401 && !url.startsWith('/auth/')) {
      setToken(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('active_club_id');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;
