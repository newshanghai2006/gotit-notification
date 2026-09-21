# Gotit

Gotit 是一个安卓优先的提醒收件箱。客户端使用 Expo React Native，服务端使用 Cloudflare Workers、D1 和 KV。英文版说明见 [README.en.md](README.en.md)。

## 本地开发

`npm run start` 只启动 Expo 界面，登录 API 需要另一个终端启动 Worker：

```powershell
cd D:\Work-DIR\97_pythonSample\04_VsCode\Gotit\worker
npm install
npx wrangler d1 execute gotit --local --file=schema.sql
npm run dev
```

项目根目录 `.env`：

```env
EXPO_PUBLIC_API_URL=https://gotit.4310212.xyz
EXPO_PUBLIC_AUTH_MODE=dev
```

然后启动客户端：

```powershell
cd D:\Work-DIR\97_pythonSample\04_VsCode\Gotit
npx expo start --clear --max-workers 1
```

开发模式不会发送邮件，输入任意有效邮箱即可进入测试。

## Cloudflare 部署

登录 Wrangler 并创建资源：

```powershell
cd worker
npx wrangler login
npx wrangler d1 create gotit
npx wrangler kv namespace create OTP
```

将命令返回的 D1 `database_id` 和 KV `id` 写入 `worker/wrangler.toml`，然后初始化远程数据库并部署：

```powershell
npx wrangler d1 execute gotit --remote --file=schema.sql
npx wrangler deploy
```

## 使用 Resend 发送邮箱验证码

正式邮箱登录使用 Resend 的 HTTP API，不需要在项目中保存邮件服务密码。

### 1. 创建 Resend API Key

登录 [Resend](https://resend.com)，打开 **API Keys**，创建一个具有发送权限的 API Key。完整 Key 只在创建时显示，不要提交到 Git、代码或 `.env`。

### 2. 验证发件域名

在 Resend 的 **Domains** 页面添加自己的域名，按页面要求添加 DNS 记录。验证完成后准备一个发件地址，例如：

```text
Gotit <noreply@mail.example.com>
```

### 3. 配置 Worker

不要把个人发件地址写入会提交到 GitHub 的 `wrangler.toml`。将发件地址也保存为 Cloudflare Secret：

```powershell
npx wrangler secret put MAIL_FROM
npx wrangler secret put RESEND_API_KEY
```

分别按提示输入发件地址（例如 `Gotit <noreply@mail.example.com>`）和 Resend API Key。不要把它们写入 `wrangler.toml`。

### 4. 开启真实邮箱登录

把 `worker/wrangler.toml` 改为：

```toml
DEV_AUTH_ENABLED = "false"
```

项目根目录 `.env` 改为：

```env
EXPO_PUBLIC_API_URL=https://gotit.4310212.xyz
EXPO_PUBLIC_AUTH_MODE=email
```

重新部署并重启 Expo：

```powershell
cd worker
npx wrangler deploy
cd ..
npx expo start --clear --max-workers 1
```

用户首次登录时点击“获取验证码”，Worker 会调用 Resend 发送 6 位验证码；验证码保存 10 分钟。发送失败时，优先检查 Resend 域名状态、`MAIL_FROM` 和 API Key 权限。

## 用户 API Token

登录后点击收件箱右上角的 `API`：

1. App 调用 `POST /me/api-token`。
2. 服务端生成用户专属 Token。
3. 弹窗只显示一次，并提供“复制 Token”按钮。
4. D1 只保存 Token 哈希。

使用 Token 推送消息：

Windows CMD 使用双引号并转义 JSON 内部双引号：

```cmd
curl.exe -X POST "https://gotit.4310212.xyz/push" -H "X-API-Token: gotit_USER_TOKEN" -H "Content-Type: application/json" -d "{\"title\":\"订单提醒\",\"sender\":\"订单系统\",\"body\":\"你的订单已发货。\"}"
```

PowerShell 可以使用单引号包住 JSON：

```powershell
curl -X POST https://gotit.4310212.xyz/push `
  -H "X-API-Token: gotit_USER_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"title":"订单提醒","sender":"订单系统","body":"你的订单已发货。"}'
```

登录会话有效期为 1 年，并保存在手机本地。清除 App 数据、卸载重装或 Token 过期后需要重新登录。

## APK

EAS 云构建不会自动使用本机 `.env` 中的变量。先把客户端需要的公开变量写入 EAS 的 `preview` 环境：

```powershell
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://gotit.4310212.xyz --environment preview --visibility plaintext
npx eas-cli@latest env:set --name EXPO_PUBLIC_AUTH_MODE --value dev --environment preview --visibility plaintext
```

如果已经配置 Resend 并准备测试正式邮箱登录，把第二个值改成 `email`。这两个变量会被编译进 App，不是密码；Resend API Key 仍然只放在 Cloudflare Worker Secret 中。

EAS 账号登录并关联项目（当前项目已经有 `projectId`，通常不需要重复执行）：

```powershell
npx eas-cli@latest login
npx eas-cli@latest init --id 你的Expo项目ID
```

生成可直接安装的 APK：

```powershell
npx eas-cli@latest build -p android --profile preview
```

生成用于测试 Android 原生推送的 development APK：

```powershell
npx eas-cli@latest build -p android --profile development
npx expo start --dev-client --max-workers 1
```

EAS 会自动生成和管理 Android keystore，不需要购买签名证书。应用图标使用根目录的 `app-icon.png`。

## 修改后需要执行什么

| 修改内容 | 需要执行的命令 |
|---|---|
| `worker/src`、Worker 配置或服务端逻辑 | `cd worker` 后执行 `npm run deploy` |
| `worker/schema.sql` | 执行 `npx wrangler d1 execute gotit --remote --file=schema.sql`，如同时修改 Worker 再执行 `npm run deploy` |
| `App.tsx`、`src`、`app.json`、图标或客户端依赖 | 重新执行 `npx eas-cli@latest build --platform android --profile preview` 并安装新 APK |
| 只修改本地 `.env` | Expo 调试时重启 `npx expo start --clear --max-workers 1`；已生成的 APK 不会自动更新 |
| 修改 EAS 环境变量 | 重新执行 EAS build，变量会在构建时写入 App |
| 修改 README | 不需要部署或重新构建 |

`wrangler deploy` 只更新 Cloudflare Worker，不会更新手机里的 App；EAS build 只更新客户端，不会部署 Worker。

## GitHub 提交前检查

- 不提交根目录 `.env`。
- 不提交 `worker/.dev.vars`；只提交 `worker/.dev.vars.example`。
- `RESEND_API_KEY`、`MAIL_FROM`、`API_TOKEN` 和 `EXPO_ACCESS_TOKEN` 只使用 `wrangler secret put` 保存。
- D1/KV 的 ID、Worker URL 和应用包名不是密码，但仍应只在需要时公开。
- 如果任何 API Key、邮箱密码或签名文件意外进入 Git 历史，应立即撤销并重新生成，单纯删除当前文件不够。
