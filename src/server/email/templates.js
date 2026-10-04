// Savora Food email templates, styled to match the website (orange on cream).
// Table-based layout with inline styles so it renders in Gmail, Outlook and mobile apps.
// Every function returns { subject, htmlContent, textContent }.

const LOGO_URL = "https://savora-food.vercel.app/savora-logo-wide.png";

const ORANGE = "#F26B00";
const INK = "#2B2420";
const MUTED = "#7A6F66";
const PAGE = "#F7F1E8";
const CARD = "#FFFFFF";
const TINT = "#FFF3E6";
const LINE = "#EFE6DA";
const SANS = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function logoHtml() {
  return `<img src="${LOGO_URL}" alt="Savora Food" width="160" style="display:block;margin:0 auto;border:0;outline:none;height:auto;max-width:160px;">`;
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
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td bgcolor="${CARD}" style="background:${CARD};padding:34px 30px;border:1px solid ${LINE};border-radius:14px;">
            <div style="text-align:center;padding:0 0 22px 0;">${logoHtml()}</div>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:22px 20px 0 20px;font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED};">
            Your Food. Your Choice. Delivered.<br>
            You received this email because someone used your address on Savora Food.
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
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;">
  <tr>
    <td align="center" bgcolor="${ORANGE}" style="background:${ORANGE};border-radius:8px;">
      <a href="${esc(href)}" target="_blank" style="display:block;padding:15px 20px;font-family:${SANS};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

export function buildResetEmail(link, minutes = 30) {
  const safeLink = esc(link);
  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-family:${SANS};font-size:24px;line-height:30px;font-weight:700;color:${INK};text-align:center;">Reset your password</h1>
<p style="margin:0;font-family:${SANS};font-size:15px;line-height:24px;color:${INK};text-align:center;">
  We got a request to reset the password on your Savora Food account. Tap the button below to choose a new one.
</p>
${button(link, "Reset password")}
<p style="margin:0 0 22px 0;font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED};text-align:center;">
  This link expires in ${minutes} minutes and can only be used once.
</p>
<p style="margin:0 0 6px 0;font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED};">Button not working? Paste this link into your browser:</p>
<p style="margin:0 0 22px 0;font-family:${SANS};font-size:12px;line-height:18px;word-break:break-all;"><a href="${safeLink}" style="color:${ORANGE};">${safeLink}</a></p>
<p style="margin:0;padding-top:18px;border-top:1px solid ${LINE};font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED};">
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
      `This link expires in ${minutes} minutes and can only be used once.`,
      "",
      "Didn't ask for this? Ignore this email. Your password stays the same.",
    ].join("\n"),
  };
}

export function buildOtpEmail(code, minutes = 10) {
  const safeCode = esc(code);
  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-family:${SANS};font-size:24px;line-height:30px;font-weight:700;color:${INK};text-align:center;">Your verification code</h1>
<p style="margin:0;font-family:${SANS};font-size:15px;line-height:24px;color:${INK};text-align:center;">
  Enter this code in Savora Food to continue.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center" bgcolor="${TINT}" style="background:${TINT};border:1px solid ${ORANGE};border-radius:10px;padding:18px 10px;">
      <span style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:${INK};">${safeCode}</span>
    </td>
  </tr>
</table>
<p style="margin:0 0 22px 0;font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED};text-align:center;">
  This code expires in ${minutes} minutes and can only be used once.
</p>
<p style="margin:0;padding-top:18px;border-top:1px solid ${LINE};font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED};">
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
      `It expires in ${minutes} minutes and can only be used once.`,
      "Never share this code with anyone. Savora Food will never ask you for it.",
      "Didn't request it? Ignore this email.",
    ].join("\n"),
  };
}
