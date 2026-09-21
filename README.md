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

Expo Go can test login, the inbox, reading, deleting, and API messages. Expo Go cannot provide Android remote push notifications because `expo-notifications` was removed from Expo Go starting with SDK 53. The app now skips notification registration when it detects Expo Go, so this warning should not block the rest of the app. For real push testing, build a development client:

```powershell
npx eas login
npx eas build -p android --profile development
npx expo start --dev-client --max-workers 1
```

Install the generated development APK on the phone, then open the project with that app instead of Expo Go.

## 2. Configure Cloudflare

Install and log in to Wrangler:

```powershell
cd worker
npm install
npx wrangler login
```

For the first local test, you do not need to create remote Cloudflare resources yet. Open a second terminal in `worker`, initialize the local D1 database, and keep the Worker running:

```powershell
npm install
npx wrangler d1 execute gotit --local --file=schema.sql
npm run dev
```

The Worker will listen on `http://0.0.0.0:8787`. Put the computer's reachable Wi-Fi IPv4 address in the project `.env`, for example `EXPO_PUBLIC_API_URL=http://192.168.137.1:8787`. Keep this terminal open while testing the app. In another terminal, start Expo with `npm run start`.

If `ipconfig` shows several IPv4 addresses, use the address on the same Wi-Fi or hotspot network as the phone. After changing `.env`, stop Expo and restart it with `npx expo start --clear --max-workers 1`.

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

The preview profile should use `android.buildType = "apk"`; the finished APK is available from the EAS build page. A production Play Store build should use an Android App Bundle (`.aab`) instead.

## 6. Expo/EAS accounts, signing, and fees

An Expo account is free. Create one at `https://expo.dev/signup`, then log in from the project directory:

```powershell
npx eas-cli@latest login
npx eas-cli@latest whoami
```

The current EAS Free plan is `$0/month` and includes up to 15 Android builds and 15 iOS builds per month, with a low-priority queue. It is enough for initial testing and small projects. Paid plans are only needed for higher build quotas, faster queues, or larger teams; the pricing page currently lists Starter at `$19/month` plus usage. EAS may still require account verification, but a paid subscription is not required for the first free quota.

For Android signing, EAS can generate and manage the keystore automatically. During the first build, answer yes when EAS asks to create Android credentials. You do not need to buy an Android certificate. The keystore is private and must never be committed to the repository. Inspect or manage it with:

```powershell
npx eas-cli@latest credentials -p android
```

There are two separate costs to understand:

- Installing an APK directly on a phone: no Google Play account and no Google fee are required.
- Publishing on Google Play: a Google Play Console developer registration is required. Google currently charges a one-time `$25 USD` registration fee; Google may also require identity verification.

iOS will require an Apple Developer Program membership when we build or publish the iOS app. Apple currently charges `$99 USD/year` in most regions. EAS can manage iOS certificates and provisioning profiles after the Apple membership is connected, but it cannot replace that membership.

Recommended first APK flow:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build -p android --profile preview
```

The `preview` profile produces an installable APK. The `development` profile produces an APK containing the development client, which is needed for testing Android push notifications. The `production` profile is configured for a Play Store `.aab`.
