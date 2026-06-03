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

export default client;
