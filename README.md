# Gotit

Gotit 是一个安卓优先的提醒收件箱。客户端使用 Expo React Native，服务端使用 Cloudflare Workers、D1 和 KV。英文说明见 [README.en.md](README.en.md)。

## 一、最简单的本地测试

`npm run start` 只启动手机界面，登录接口还需要单独启动 Worker。请打开两个 PowerShell 窗口。

### 窗口一：启动本地 Worker

```powershell
cd D:\Work-DIR\97_pythonSample\04_VsCode\Gotit\worker
npm install
npx wrangler d1 execute gotit --local --file=schema.sql
npm run dev
```

看到 `Ready on http://0.0.0.0:8787` 后不要关闭窗口。

### 窗口二：启动 Expo

项目根目录的 `.env` 示例：

```env
EXPO_PUBLIC_API_URL=http://192.168.137.1:8787
EXPO_PUBLIC_AUTH_MODE=dev
```

把 IP 换成手机能够访问的电脑局域网 IPv4 地址。用 `ipconfig` 查看地址；真机不要使用 `localhost`。

```powershell
cd D:\Work-DIR\97_pythonSample\04_VsCode\Gotit
npx expo start --clear --max-workers 1
```

开发模式不会发送邮件。输入任意有效邮箱，例如 `test@example.com`，点击“进入测试”即可登录。

## 二、创建 Cloudflare 资源

如果只做本地测试，可以先跳过本节。正式部署时执行：

```powershell
cd worker
npx wrangler login
npx wrangler d1 create gotit
npx wrangler kv namespace create OTP
```

将命令返回的 D1 `database_id` 和 KV `id` 写入 `worker/wrangler.toml` 的对应位置。当前项目已经填入已创建的资源 ID。

初始化远程数据库并部署：

```powershell
npx wrangler d1 execute gotit --remote --file=schema.sql
npx wrangler deploy
```

部署后，把项目根目录 `.env` 改成：

```env
EXPO_PUBLIC_API_URL=https://gotit.4310212.xyz
EXPO_PUBLIC_AUTH_MODE=dev
```

然后重启 Expo。

## 三、真实邮箱验证码

开发模式不需要邮箱。正式模式需要 Resend：

```powershell
npx wrangler secret put RESEND_API_KEY
```

同时把 `worker/wrangler.toml` 改为：

```toml
DEV_AUTH_ENABLED = "false"
```

客户端 `.env` 改为：

```env
EXPO_PUBLIC_AUTH_MODE=email
```

Resend 需要配置可用的发件域名，否则不会真正发送邮件。

注意：Cloudflare Worker 不能直接连接 `smtp.163.com:465` 这类原始 SMTP TCP 服务，因此不能仅把 163 的 SMTP 参数写入 Worker 就发送邮件。当前 Worker 使用 Resend 的 HTTP API；如果必须使用 163 SMTP，需要另行部署一个支持 SMTP 的邮件中转服务，再由 Worker 通过 HTTPS 调用。你在聊天中发送过 163 邮箱密码，建议立即在 163 邮箱后台撤销/更换该密码，不要把密码写入代码、`.env` 或 Git。

## 四、用户 API Token

登录后点击收件箱右上角的 `API`：

1. App 调用 `POST /me/api-token`
2. 服务端生成用户专属 Token
3. 弹窗只显示这一次
4. 点击“复制 Token”保存到剪贴板
5. D1 只保存 Token 哈希

登录会话 Token 的有效期为 1 年，并保存在手机本地存储中；只要用户不清除 App 数据、不卸载 App，通常不需要重复登录。清除数据、卸载重装或 Token 过期后需要重新登录。

使用用户 Token 推送消息时不需要填写邮箱：

```powershell
curl -X POST https://你的-worker域名.workers.dev/push `
  -H "X-API-Token: gotit_用户Token" `
  -H "Content-Type: application/json" `
  -d '{"title":"订单提醒","sender":"订单系统","body":"你的订单已发货。"}'
```

撤销该用户全部 Token：

```text
DELETE /me/api-token
```

## 五、EAS 和 APK

EAS 账号注册后，在项目根目录执行截图中的项目关联命令：

```powershell
npx eas-cli@latest login
npx eas-cli@latest init --id 你的Expo项目ID
```

`Go to dashboard` 只是打开网页后台，不是必须步骤。

生成可以直接安装的 APK：

```powershell
npx eas-cli@latest build -p android --profile preview
```

生成用于测试 Android 推送的 development APK：

```powershell
npx eas-cli@latest build -p android --profile development
npx expo start --dev-client --max-workers 1
```

EAS 可以自动生成和管理 Android keystore，不需要购买签名证书。项目图标使用根目录的 `app-icon.png`。
