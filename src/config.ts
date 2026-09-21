export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';
export const AUTH_MODE = process.env.EXPO_PUBLIC_AUTH_MODE === 'email' ? 'email' : 'dev';
