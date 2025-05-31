// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// WebSocket Configuration
export const WS_URL = API_BASE_URL.replace('http', 'ws');

// Environment
export const isDevelopment = import.meta.env.DEV;
export const isProduction = import.meta.env.PROD;