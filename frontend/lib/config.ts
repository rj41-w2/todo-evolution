export const API_BASE_URL = typeof window !== 'undefined' ? '/api/backend' : (process.env.INTERNAL_BACKEND_URL || 'http://127.0.0.1:8000');
