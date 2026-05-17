import type { EmailPayload } from "./types";

export type PasswordResetEmailData = {
  email: string;
  resetLink: string;
  expiryHours: number;
};

export type WelcomeEmailData = {
  email: string;
  displayName: string;
  loginLink: string;
};

export function createPasswordResetEmail(data: PasswordResetEmailData): EmailPayload {
  const { email, resetLink, expiryHours } = data;

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>重置密码</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px 40px;">
              <h1 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">重置密码</h1>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">
                您好，
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">
                我们收到了您的密码重置请求。请点击下方按钮重置密码：
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500;">重置密码</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                或者复制以下链接到浏览器中打开：
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #2563eb; word-break: break-all;">
                ${resetLink}
              </p>
              <p style="margin: 20px 0 0 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                此链接将在 <strong>${expiryHours} 小时</strong>后失效。
              </p>
              <p style="margin: 20px 0 0 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                如果您没有请求重置密码，请忽略此邮件。
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 40px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #9ca3af;">
                此邮件由系统自动发送，请勿直接回复。
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
重置密码

您好，

我们收到了您的密码重置请求。请访问以下链接重置密码：

${resetLink}

此链接将在 ${expiryHours} 小时后失效。

如果您没有请求重置密码，请忽略此邮件。

---
此邮件由系统自动发送，请勿直接回复。
  `.trim();

  return {
    to: { email },
    subject: "重置您的密码",
    html,
    text,
  };
}

export function createWelcomeEmail(data: WelcomeEmailData): EmailPayload {
  const { email, displayName, loginLink } = data;

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>欢迎加入</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px 40px;">
              <h1 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">欢迎加入 xoxo Meridian！</h1>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">
                ${displayName}，您好！
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">
                感谢您注册 xoxo Meridian。您的账号已创建成功，现在可以开始使用了。
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${loginLink}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500;">立即登录</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 20px 0 0 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                如有任何问题，欢迎随时联系我们。
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 40px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #9ca3af;">
                此邮件由系统自动发送，请勿直接回复。
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
欢迎加入 xoxo Meridian！

${displayName}，您好！

感谢您注册 xoxo Meridian。您的账号已创建成功，现在可以开始使用了。

立即登录：${loginLink}

如有任何问题，欢迎随时联系我们。

---
此邮件由系统自动发送，请勿直接回复。
  `.trim();

  return {
    to: { email, name: displayName },
    subject: "欢迎加入 xoxo Meridian",
    html,
    text,
  };
}
