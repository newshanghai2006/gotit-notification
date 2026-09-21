var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var id = /* @__PURE__ */ __name(() => crypto.randomUUID(), "id");
var sessionToken = /* @__PURE__ */ __name((userId) => btoa(`${userId}.${crypto.randomUUID()}`), "sessionToken");
var apiToken = /* @__PURE__ */ __name(() => `gotit_${crypto.randomUUID().replaceAll("-", "")}`, "apiToken");
async function hash(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(hash, "hash");
function response(body, status, env) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": env.APP_ORIGIN ?? "*", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Token", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS" } });
}
__name(response, "response");
async function findUser(request, env) {
  const value = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!value) return null;
  try {
    return await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(atob(value).split(".")[0]).first();
  } catch {
    return null;
  }
}
__name(findUser, "findUser");
async function getOrCreateUser(email, env) {
  const normalized = email.toLowerCase();
  let user = await env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(normalized).first();
  if (!user) {
    user = { id: id(), email: normalized };
    await env.DB.prepare("INSERT INTO users(id,email,created_at) VALUES(?,?,?)").bind(user.id, user.email, (/* @__PURE__ */ new Date()).toISOString()).run();
  }
  return user;
}
__name(getOrCreateUser, "getOrCreateUser");
async function sendEmail(env, email, code) {
  if (!env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Gotit <onboarding@resend.dev>", to: [email], subject: "Gotit login code", text: `Your Gotit login code is ${code}. It expires in 10 minutes.` }) });
}
__name(sendEmail, "sendEmail");
async function pushToDevices(env, userId, title, body) {
  const rows = await env.DB.prepare("SELECT push_token FROM devices WHERE user_id = ?").bind(userId).all();
  if (!rows.results.length) return;
  await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json", ...env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {} }, body: JSON.stringify(rows.results.map((row) => ({ to: row.push_token, title, body, sound: "default" }))) });
}
__name(pushToDevices, "pushToDevices");
async function route(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method === "OPTIONS") return response({}, 204, env);
  if (path === "/auth/request-code" && request.method === "POST") {
    const { email } = await request.json();
    if (!email?.includes("@")) return response({ error: "Invalid email" }, 400, env);
    const normalized = email.toLowerCase();
    const code = String(Math.floor(1e5 + Math.random() * 9e5));
    await env.OTP.put(`otp:${normalized}`, code, { expirationTtl: 600 });
    await sendEmail(env, normalized, code);
    return response({ ok: true, ...env.RESEND_API_KEY ? {} : { devCode: code } }, 200, env);
  }
  if (path === "/auth/dev-login" && request.method === "POST") {
    if (env.DEV_AUTH_ENABLED !== "true") return response({ error: "Development login is disabled" }, 403, env);
    const { email } = await request.json();
    if (!email?.includes("@")) return response({ error: "Invalid email" }, 400, env);
    const user2 = await getOrCreateUser(email, env);
    return response({ token: sessionToken(user2.id), user: user2 }, 200, env);
  }
  if (path === "/auth/verify-code" && request.method === "POST") {
    const { email, code } = await request.json();
    const normalized = email?.toLowerCase();
    if (!normalized || !code || await env.OTP.get(`otp:${normalized}`) !== code) return response({ error: "Invalid or expired code" }, 401, env);
    const user2 = await getOrCreateUser(normalized, env);
    await env.OTP.delete(`otp:${normalized}`);
    return response({ token: sessionToken(user2.id), user: user2 }, 200, env);
  }
  if (path === "/push" && request.method === "POST") {
    const supplied = request.headers.get("X-API-Token");
    const input = await request.json();
    if (!supplied || !input.title || !input.body) return response({ error: "X-API-Token, title and body are required" }, 400, env);
    let userId;
    if (env.API_TOKEN && supplied === env.API_TOKEN) {
      if (!input.email) return response({ error: "email is required with the server token" }, 400, env);
      userId = (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(input.email.toLowerCase()).first())?.id;
    } else userId = (await env.DB.prepare("SELECT user_id FROM api_tokens WHERE token_hash = ? AND revoked = 0").bind(await hash(supplied)).first())?.user_id;
    if (!userId) return response({ error: "Invalid API token or user" }, 401, env);
    const message = { id: id(), userId, title: input.title, sender: input.sender ?? "API", body: input.body, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    await env.DB.prepare("INSERT INTO messages(id,user_id,title,sender,body,created_at) VALUES(?,?,?,?,?,?)").bind(message.id, message.userId, message.title, message.sender, message.body, message.createdAt).run();
    await pushToDevices(env, userId, message.title, message.body);
    return response({ message }, 201, env);
  }
  const user = await findUser(request, env);
  if (!user) return response({ error: "Not authenticated" }, 401, env);
  if (path === "/me/api-token" && request.method === "POST") {
    const plain = apiToken();
    await env.DB.prepare("INSERT INTO api_tokens(id,user_id,token_hash,created_at) VALUES(?,?,?,?)").bind(id(), user.id, await hash(plain), (/* @__PURE__ */ new Date()).toISOString()).run();
    return response({ token: plain }, 201, env);
  }
  if (path === "/me/api-token" && request.method === "DELETE") {
    await env.DB.prepare("UPDATE api_tokens SET revoked = 1 WHERE user_id = ?").bind(user.id).run();
    return response({ ok: true }, 200, env);
  }
  if (path === "/messages" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT id,title,sender,body,created_at,read FROM messages WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all();
    return response({ messages: rows.results.map((row) => ({ id: row.id, title: row.title, sender: row.sender, body: row.body, createdAt: row.created_at, read: Boolean(row.read) })) }, 200, env);
  }
  const messageMatch = path.match(/^\/messages\/([^/]+)(?:\/(read))?$/);
  if (messageMatch) {
    const messageId = messageMatch[1];
    const owned = await env.DB.prepare("SELECT id FROM messages WHERE id = ? AND user_id = ?").bind(messageId, user.id).first();
    if (!owned) return response({ error: "Message not found" }, 404, env);
    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(messageId).run();
      return response({ ok: true }, 200, env);
    }
    if (request.method === "POST" && messageMatch[2] === "read") {
      await env.DB.prepare("UPDATE messages SET read = 1 WHERE id = ?").bind(messageId).run();
      return response({ ok: true }, 200, env);
    }
  }
  if (path === "/devices" && request.method === "POST") {
    const { pushToken } = await request.json();
    if (!pushToken) return response({ error: "pushToken is required" }, 400, env);
    await env.DB.prepare("INSERT OR IGNORE INTO devices(user_id,push_token) VALUES(?,?)").bind(user.id, pushToken).run();
    return response({ ok: true }, 200, env);
  }
  return response({ error: "Not found" }, 404, env);
}
__name(route, "route");
var src_default = { fetch: /* @__PURE__ */ __name((request, env) => route(request, env), "fetch") };

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-t5MYl2/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-t5MYl2/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
