import { API_BASE_URL } from './config';

export type Message = {
  id: string;
  title: string;
  sender: string;
  body: string;
  createdAt: string;
  read: boolean;
};

type RequestOptions = { method?: string; body?: unknown };

export async function api<T>(path: string, token?: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? '请求失败，请稍后重试');
  return data as T;
}
