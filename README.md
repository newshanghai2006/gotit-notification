# Gotit

Gotit is an Android-first reminder inbox. It supports email-code login, a development login mode, Expo push notifications, Cloudflare Workers + D1 + KV, and user-owned API tokens.

## 1. Run the app in development mode

The default mode is `dev`, so no email is sent. Copy `.env.example` to `.env` and set the Worker URL:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:8787
EXPO_PUBLIC_AUTH_MODE=dev
```

For a real Android phone, replace the IP with the computer running Wrangler. Do not use `localhost` on a phone. Start the app with:

```powershell
npm install
npm run start
```

The start script uses one Metro worker to avoid the `DataCloneError: Data cannot be cloned, out of memory` failure on some Windows/Node installations. The same option was verified with an Android export.

## 2. Configure Cloudflare

Install and log in to Wrangler:

```powershell
cd worker
npm install
npx wrangler login
```

Create the two free storage resources:

```powershell
npx wrangler d1 create gotit
npx wrangler kv namespace create OTP
```

Copy the returned D1 `database_id` and KV namespace `id` into `worker/wrangler.toml`. Keep the binding names exactly `DB` and `OTP`.

Initialize the database. Run this again after updating the schema for an existing deployment; every statement is idempotent:

```powershell
npx wrangler d1 execute gotit --remote --file=schema.sql
```

Set the secrets. `API_TOKEN` is an optional legacy server token; user tokens described below do not need it.

```powershell
npx wrangler secret put API_TOKEN
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EXPO_ACCESS_TOKEN
```

For the first test, keep this in `wrangler.toml`:

```toml
DEV_AUTH_ENABLED = "true"
```

Deploy the Worker:

```powershell
npx wrangler deploy
```

Then set the deployed URL in the project `.env` and restart Expo. For real email login, use `EXPO_PUBLIC_AUTH_MODE=email`, set `DEV_AUTH_ENABLED = "false"`, and configure Resend with a verified sender/domain. Without `RESEND_API_KEY`, no real email is sent.

## 3. User API tokens

The current implementation now supports user-owned tokens. After logging in, tap `API` in the inbox header. The app calls `POST /me/api-token` and displays a new token once. Copy it immediately; only its hash is stored in D1. Tapping `API` again creates another valid token. To revoke all tokens for that user, call `DELETE /me/api-token` with the app session token.

Send a reminder with the user's token:

```powershell
curl -X POST https://YOUR_WORKER.workers.dev/push `
  -H "X-API-Token: gotit_USER_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"title":"订单提醒","sender":"订单系统","body":"你的订单已发货。"}'
```

The user token identifies the recipient, so `email` is not required. Small scripts can use the same endpoint with Python, Node.js, PowerShell, or any HTTP client. The old server `API_TOKEN` is still accepted, but it requires an `email` field and is intended for administrator/system integrations.

## 4. Email-code flow

In email mode the client calls `/auth/request-code`; the Worker creates a six-digit code, stores it in KV for ten minutes, and sends it through Resend. The client then calls `/auth/verify-code`. For local testing, development mode is recommended because it does not depend on a mail provider.

## 5. App icon and APK

`app-icon.png` is configured as the Expo icon and Android adaptive-icon foreground. It is included in the app config.

To create an installable APK through Expo's cloud builder:

```powershell
npx eas login
npx eas build:configure
npx eas build -p android --profile preview
```

The preview profile should use `android.buildType = "apk"`; the finished APK is available from the EAS build page. A production Play Store build should use an Android App Bundle (`.aab`) instead. An APK cannot be produced here until an Expo/EAS account and Android signing credentials are available.
