# Gotit

Gotit is an Android-first reminder inbox built with Expo React Native and a Cloudflare Workers API.

## Local development

Copy `.env.example` to `.env`. For a real phone, use the computer's Wi-Fi IPv4 address, not `localhost`:

```env
EXPO_PUBLIC_API_URL=http://192.168.137.1:8787
EXPO_PUBLIC_AUTH_MODE=dev
```

Start the local API in one terminal:

```powershell
cd worker
npm install
npx wrangler d1 execute gotit --local --file=schema.sql
npm run dev
```

Start Expo in another terminal:

```powershell
cd ..
npm run start
```

Development login does not send email. Enter any valid email and tap the test-login button.

## Cloudflare deployment

Create resources and copy their IDs into `worker/wrangler.toml`:

```powershell
cd worker
npx wrangler login
npx wrangler d1 create gotit
npx wrangler kv namespace create OTP
npx wrangler d1 execute gotit --remote --file=schema.sql
npx wrangler deploy
```

For real email login, verify a sender domain in Resend, store the sender address and API key as Worker secrets, and never put either value in the public `wrangler.toml`:

```powershell
npx wrangler secret put MAIL_FROM
npx wrangler secret put RESEND_API_KEY
```

Set `DEV_AUTH_ENABLED = "false"` and `EXPO_PUBLIC_AUTH_MODE=email` before production deployment. Never commit API keys or mail credentials.

## User API tokens

After login, tap `API` in the inbox header. The app creates a user token through `POST /me/api-token` and shows it once with a copy button. Only a hash is stored in D1. Send a message with:

```powershell
curl -X POST https://YOUR_WORKER.workers.dev/push `
  -H "X-API-Token: gotit_USER_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"title":"Order update","sender":"Orders","body":"Your order has shipped."}'
```

## APK

EAS cloud builds do not automatically use your local `.env`. Create the public client variables in the `preview` environment first:

```powershell
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://gotit.4310212.xyz --environment preview --visibility plaintext
npx eas-cli@latest env:set --name EXPO_PUBLIC_AUTH_MODE --value dev --environment preview --visibility plaintext
```

Use `email` instead of `dev` after Resend is configured. These variables are embedded in the app and are not secrets. Keep `RESEND_API_KEY` only in the Cloudflare Worker secret store.

```powershell
npx eas-cli@latest login
npx eas-cli@latest init --id YOUR_EXPO_PROJECT_ID
npx eas-cli@latest build -p android --profile preview
```

The preview profile generates an installable APK. The development profile generates a development client needed for Android push testing. EAS can generate and manage the Android keystore automatically.
