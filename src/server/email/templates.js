// Savora Food email templates.
// Table-based layout with inline styles, so it renders in Gmail, Outlook and mobile apps.
// No images or external CSS. Every function returns { subject, htmlContent, textContent }.

const GREEN = "#0B3D2E";
const SAFFRON = "#F5B301";
const INK = "#1F2A24";
const MUTED = "#5B6860";
const PAGE = "#EDF2EE";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout({ preheader, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Savora Food</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td bgcolor="${GREEN}" style="background:${GREEN};padding:22px 32px;border-radius:12px 12px 0 0;">
            <span style="font-family:${SERIF};font-size:26px;font-weight:bold;color:#FFFFFF;letter-spacing:0.5px;">Savora</span><span style="font-family:${SERIF};font-size:26px;font-weight:bold;color:${SAFFRON};">.</span>
            <span style="font-family:${SANS};font-size:13px;color:#BFD6CB;padding-left:6px;">Food</span>
          </td>
        </tr>
        <tr>
          <td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:36px 32px 32px 32px;border-radius:0 0 12px 12px;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED};text-align:center;">
            You received this email because someone used your address on Savora Food.<br>
            Need help? Reply to this email.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
  <tr>
    <td bgcolor="${SAFFRON}" style="background:${SAFFRON};border-radius:8px;">
      <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:16px;font-weight:bold;color:${GREEN};text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

export function buildResetEmail(link, minutes = 30) {
  const safeLink = esc(link);
  const bodyHtml = `
<h1 style="margin:0 0 14px 0;font-family:${SERIF};font-size:26px;line-height:32px;color:${INK};">Reset your password</h1>
<p style="margin:0;font-family:${SANS};font-size:16px;line-height:25px;color:${INK};">
  We got a request to reset the password on your Savora Food account. Tap the button to choose a new one.
</p>
${button(link, "Reset password")}
<p style="margin:0 0 22px 0;font-family:${SANS};font-size:14px;line-height:22px;color:${MUTED};">
  This link works once and expires in ${minutes} minutes.
</p>
<p style="margin:0 0 6px 0;font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED};">Button not working? Paste this link into your browser:</p>
<p style="margin:0 0 24px 0;font-family:${SANS};font-size:13px;line-height:20px;word-break:break-all;"><a href="${safeLink}" style="color:${GREEN};">${safeLink}</a></p>
<p style="margin:0;padding-top:18px;border-top:1px solid #E3E9E5;font-family:${SANS};font-size:14px;line-height:22px;color:${MUTED};">
  Didn't ask for this? Ignore this email. Your password stays the same.
</p>`;

  return {
    subject: "Reset your Savora Food password",
    htmlContent: layout({
      preheader: `Your reset link expires in ${minutes} minutes.`,
      bodyHtml,
    }),
    textContent: [
      "Reset your Savora Food password",
      "",
      "We got a request to reset the password on your account. Open this link to choose a new one:",
      link,
      "",
      `This link works once and expires in ${minutes} minutes.`,
      "",
      "Didn't ask for this? Ignore this email. Your password stays the same.",
    ].join("\n"),
  };
}

export function buildOtpEmail(code, minutes = 10) {
  const safeCode = esc(code);
  const bodyHtml = `
<h1 style="margin:0 0 14px 0;font-family:${SERIF};font-size:26px;line-height:32px;color:${INK};">Your verification code</h1>
<p style="margin:0;font-family:${SANS};font-size:16px;line-height:25px;color:${INK};">
  Enter this code in the Savora Food app to continue.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;">
  <tr>
    <td align="center" bgcolor="#F4F8F5" style="background:#F4F8F5;border:2px solid ${GREEN};border-radius:10px;padding:20px 10px;">
      <span style="font-family:'Courier New',Courier,monospace;font-size:38px;font-weight:bold;letter-spacing:10px;color:${GREEN};">${safeCode}</span>
    </td>
  </tr>
</table>
<p style="margin:0 0 22px 0;font-family:${SANS};font-size:14px;line-height:22px;color:${MUTED};">
  This code expires in ${minutes} minutes and works once.
</p>
<p style="margin:0;padding-top:18px;border-top:1px solid #E3E9E5;font-family:${SANS};font-size:14px;line-height:22px;color:${MUTED};">
  Never share this code with anyone. Savora Food will never ask you for it. Didn't request it? Ignore this email.
</p>`;

  return {
    subject: `${code} is your Savora Food code`,
    htmlContent: layout({
      preheader: `Your code expires in ${minutes} minutes.`,
      bodyHtml,
    }),
    textContent: [
      `Your Savora Food verification code: ${code}`,
      "",
      `It expires in ${minutes} minutes and works once.`,
      "Never share this code with anyone. Savora Food will never ask you for it.",
      "Didn't request it? Ignore this email.",
    ].join("\n"),
  };
}
