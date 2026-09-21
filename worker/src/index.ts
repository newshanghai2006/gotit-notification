export interface Env {
  DB: D1Database;
  OTP: KVNamespace;
  API_TOKEN?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  EXPO_ACCESS_TOKEN?: string;
  APP_ORIGIN?: string;
  DEV_AUTH_ENABLED?: string;
}

type User = { id: string; email: string };
type MessageRow = { id: string; title: string; sender: string; body: string; created_at: string; read: number };

const id = () => crypto.randomUUID();
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const sessionToken = (userId: string) => btoa(`${userId}.${Date.now() + SESSION_TTL_MS}.${crypto.randomUUID()}`);
const apiToken = () => `gotit_${crypto.randomUUID().replaceAll('-', '')}`;

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function response(body: unknown, status: number, env: Env) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': env.APP_ORIGIN ?? '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Token', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' } });
}

async function findUser(request: Request, env: Env): Promise<User | null> {
  const value = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!value) return null;
  try {
    const parts = atob(value).split('.');
    if (parts[1] && Number(parts[1]) && Date.now() > Number(parts[1])) return null;
    return await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(parts[0]).first<User>();
  } catch { return null; }
}

async function getOrCreateUser(email: string, env: Env) {
  const normalized = email.toLowerCase();
  let user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(normalized).first<User>();
  if (!user) { user = { id: id(), email: normalized }; await env.DB.prepare('INSERT INTO users(id,email,created_at) VALUES(?,?,?)').bind(user.id, user.email, new Date().toISOString()).run(); }
  return user;
}

async function sendEmail(env: Env, email: string, code: string) {
  if (!env.RESEND_API_KEY) return;
  const result = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM ?? 'Gotit <onboarding@resend.dev>', to: [email], subject: 'Gotit login code', text: `Your Gotit login code is ${code}. It expires in 10 minutes.` }) });
  if (!result.ok) throw new Error('Resend rejected the email request');
}

async function pushToDevices(env: Env, userId: string, title: string, body: string) {
  const rows = await env.DB.prepare('SELECT push_token FROM devices WHERE user_id = ?').bind(userId).all<{ push_token: string }>();
  if (!rows.results.length) return { registeredDevices: 0, tickets: [] };
  const result = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify(rows.results.map((row) => ({ to: row.push_token, title, body, sound: 'default', channelId: 'default' }))) });
  const payload = await result.json().catch(() => ({ error: 'Invalid response from Expo push service' }));
  if (!result.ok) return { registeredDevices: rows.results.length, error: `Expo push HTTP ${result.status}`, details: payload };
  return { registeredDevices: rows.results.length, tickets: payload };
}

async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === 'OPTIONS') return response({}, 204, env);
  if (path === '/auth/request-code' && request.method === 'POST') {
    const { email } = await request.json<{ email?: string }>();
    if (!email?.includes('@')) return response({ error: 'Invalid email' }, 400, env);
    const normalized = email.toLowerCase(); const code = String(Math.floor(100000 + Math.random() * 900000));
    await env.OTP.put(`otp:${normalized}`, code, { expirationTtl: 600 }); await sendEmail(env, normalized, code);
    return response({ ok: true, ...(env.RESEND_API_KEY ? {} : { devCode: code }) }, 200, env);
  }
  if (path === '/auth/dev-login' && request.method === 'POST') {
    if (env.DEV_AUTH_ENABLED !== 'true') return response({ error: 'Development login is disabled' }, 403, env);
    const { email } = await request.json<{ email?: string }>(); if (!email?.includes('@')) return response({ error: 'Invalid email' }, 400, env);
    const user = await getOrCreateUser(email, env); return response({ token: sessionToken(user.id), user }, 200, env);
  }
  if (path === '/auth/verify-code' && request.method === 'POST') {
    const { email, code } = await request.json<{ email?: string; code?: string }>(); const normalized = email?.toLowerCase();
    if (!normalized || !code || (await env.OTP.get(`otp:${normalized}`)) !== code) return response({ error: 'Invalid or expired code' }, 401, env);
    const user = await getOrCreateUser(normalized, env); await env.OTP.delete(`otp:${normalized}`); return response({ token: sessionToken(user.id), user }, 200, env);
  }
  if (path === '/push' && request.method === 'POST') {
    const supplied = request.headers.get('X-API-Token');
    let input: { email?: string; title?: string; sender?: string; body?: string };
    try { input = await request.json<{ email?: string; title?: string; sender?: string; body?: string }>(); } catch { return response({ error: 'Request body must be valid JSON' }, 400, env); }
    if (!supplied || !input.title || !input.body) return response({ error: 'X-API-Token, title and body are required' }, 400, env);
    let userId: string | undefined;
    if (env.API_TOKEN && supplied === env.API_TOKEN) {
      if (!input.email) return response({ error: 'email is required with the server token' }, 400, env);
      userId = (await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(input.email.toLowerCase()).first<{ id: string }>())?.id;
    } else userId = (await env.DB.prepare('SELECT user_id FROM api_tokens WHERE token_hash = ? AND revoked = 0').bind(await hash(supplied)).first<{ user_id: string }>())?.user_id;
    if (!userId) return response({ error: 'Invalid API token or user' }, 401, env);
    const message = { id: id(), userId, title: input.title, sender: input.sender ?? 'API', body: input.body, createdAt: new Date().toISOString() };
    await env.DB.prepare('INSERT INTO messages(id,user_id,title,sender,body,created_at) VALUES(?,?,?,?,?,?)').bind(message.id, message.userId, message.title, message.sender, message.body, message.createdAt).run();
    const push = await pushToDevices(env, userId, message.title, message.body);
    return response({ message, push }, 201, env);
  }
  const user = await findUser(request, env); if (!user) return response({ error: 'Not authenticated' }, 401, env);
  if (path === '/me/api-token' && request.method === 'POST') {
    const plain = apiToken(); await env.DB.prepare('INSERT INTO api_tokens(id,user_id,token_hash,created_at) VALUES(?,?,?,?)').bind(id(), user.id, await hash(plain), new Date().toISOString()).run(); return response({ token: plain }, 201, env);
  }
  if (path === '/me/api-token' && request.method === 'DELETE') { await env.DB.prepare('UPDATE api_tokens SET revoked = 1 WHERE user_id = ?').bind(user.id).run(); return response({ ok: true }, 200, env); }
  if (path === '/messages' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT id,title,sender,body,created_at,read FROM messages WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all<MessageRow>();
    return response({ messages: rows.results.map((row) => ({ id: row.id, title: row.title, sender: row.sender, body: row.body, createdAt: row.created_at, read: Boolean(row.read) })) }, 200, env);
  }
  const messageMatch = path.match(/^\/messages\/([^/]+)(?:\/(read))?$/);
  if (messageMatch) {
    const messageId = messageMatch[1]; const owned = await env.DB.prepare('SELECT id FROM messages WHERE id = ? AND user_id = ?').bind(messageId, user.id).first();
    if (!owned) return response({ error: 'Message not found' }, 404, env);
    if (request.method === 'DELETE') { await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(messageId).run(); return response({ ok: true }, 200, env); }
    if (request.method === 'POST' && messageMatch[2] === 'read') { await env.DB.prepare('UPDATE messages SET read = 1 WHERE id = ?').bind(messageId).run(); return response({ ok: true }, 200, env); }
  }
  if (path === '/devices' && request.method === 'POST') {
    const { pushToken } = await request.json<{ pushToken?: string }>(); if (!pushToken) return response({ error: 'pushToken is required' }, 400, env);
    await env.DB.prepare('INSERT OR IGNORE INTO devices(user_id,push_token) VALUES(?,?)').bind(user.id, pushToken).run(); return response({ ok: true }, 200, env);
  }
  return response({ error: 'Not found' }, 404, env);
}

export default { fetch: (request: Request, env: Env) => route(request, env) };
