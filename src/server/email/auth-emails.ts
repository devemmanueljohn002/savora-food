/**
 * Security + sign-in emails on the shared Savora layout. Every builder
 * returns { subject, htmlContent, textContent } — HTML for mail clients,
 * plain text as the guaranteed fallback. Links are absolute (caller passes
 * appUrl); lifetimes reuse RESET_MINUTES / OTP_MINUTES from ./index so the
 * wording can never disagree with the enforced expiry.
 */
import {
  EMAIL_SANS,
  EMAIL_TOKENS,
  emailCentered,
  emailHeadline,
  emailShell,
  emailSupportLine,
  emailTextLink,
  esc,
  type BuiltEmail,
} from "./layout";

export function buildVerifyEmail(verifyUrl: string, appUrl: string): BuiltEmail {
  const bodyHtml = `
${emailHeadline("Verify your email")}
${emailCentered("Welcome to Savora Food! Confirm your email address to finish creating your account.")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 12px 0;">
  <tr>
    <td align="center" bgcolor="${EMAIL_TOKENS.orange}" style="background:${EMAIL_TOKENS.orange};border-radius:8px;">
      <a href="${esc(verifyUrl)}" target="_blank" style="display:block;padding:14px 20px;font-family:${EMAIL_SANS};font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">Verify email</a>
    </td>
  </tr>
</table>
${emailCentered("This link expires in 24 hours and can only be used once.", true)}
${emailTextLink(verifyUrl, "Button not working? Paste this link into your browser")}
<p style="margin:18px 0 0 0;padding-top:16px;border-top:1px solid ${EMAIL_TOKENS.line};font-family:${EMAIL_SANS};font-size:13px;line-height:20px;color:${EMAIL_TOKENS.muted};text-align:center;">
  Didn't create an account with Savora Food? You can safely ignore this email.
</p>`;
  return {
    subject: "Verify your Savora Food email",
    htmlContent: emailShell({
      preheader: "Confirm your email to activate your Savora Food account.",
      title: "Verify your Savora Food email",
      bodyHtml,
      appUrl,
    }),
    textContent: [
      "Welcome to Savora Food!",
      "",
      "Please confirm your email address to finish creating your account. This link expires in 24 hours:",
      "",
      verifyUrl,
      "",
      "If you did not create an account with Savora Food, you can safely ignore this email.",
    ].join("\n"),
  };
}

export function buildVerificationReminderEmail(verifyUrl: string, appUrl: string): BuiltEmail {
  const bodyHtml = `
${emailHeadline("One tap left to activate your account")}
${emailCentered("It's been a little while since you joined — your account is still waiting on email verification.")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 12px 0;">
  <tr>
    <td align="center" bgcolor="${EMAIL_TOKENS.orange}" style="background:${EMAIL_TOKENS.orange};border-radius:8px;">
      <a href="${esc(verifyUrl)}" target="_blank" style="display:block;padding:14px 20px;font-family:${EMAIL_SANS};font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">Confirm my email</a>
    </td>
  </tr>
</table>
${emailCentered("This link expires in 24 hours and can only be used once.", true)}
${emailTextLink(verifyUrl, "Button not working? Paste this link into your browser")}
<p style="margin:18px 0 0 0;padding-top:16px;border-top:1px solid ${EMAIL_TOKENS.line};font-family:${EMAIL_SANS};font-size:13px;line-height:20px;color:${EMAIL_TOKENS.muted};text-align:center;">
  Didn't create an account with Savora Food? You can safely ignore this email.
</p>`;
  return {
    subject: "Verify your Savora Food email",
    htmlContent: emailShell({
      preheader: "Your Savora Food account is still waiting on verification.",
      title: "Verify your Savora Food email",
      bodyHtml,
      appUrl,
    }),
    textContent: [
      "It's been a little while since you joined Savora Food — your account is still waiting on email verification before it can be fully activated.",
      "",
      "Confirm your email now (link expires in 24 hours):",
      "",
      verifyUrl,
      "",
      "If you did not create an account with Savora Food, you can safely ignore this email.",
    ].join("\n"),
  };
}

export function buildOtpEmail(code: string, minutes = 10, appUrl = "https://savora-food.vercel.app"): BuiltEmail {
  const safeCode = esc(code);
  const bodyHtml = `
${emailHeadline("Your verification code")}
${emailCentered("Enter this code in Savora Food to continue.")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center" bgcolor="${EMAIL_TOKENS.tint}" style="background:${EMAIL_TOKENS.tint};border:1px solid ${EMAIL_TOKENS.orange};border-radius:10px;padding:18px 10px;">
      <span style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:${EMAIL_TOKENS.ink};">${safeCode}</span>
    </td>
  </tr>
</table>
${emailCentered(`This code expires in ${minutes} minutes and can only be used once.`, true)}
<p style="margin:18px 0 0 0;padding-top:16px;border-top:1px solid ${EMAIL_TOKENS.line};font-family:${EMAIL_SANS};font-size:13px;line-height:20px;color:${EMAIL_TOKENS.muted};text-align:center;">
  Never share this code with anyone. Savora Food will never ask you for it. Didn't request it? Ignore this email.
</p>`;
  // The shell needs an absolute origin for the logo; the code itself carries
  // no link, so the caller may override the default production origin.
  const origin = (appUrl || "https://savora-food.vercel.app").replace(/\/+$/, "");
  return {
    subject: `${code} is your Savora Food code`,
    htmlContent: emailShell({
      preheader: `Your code expires in ${minutes} minutes.`,
      title: "Your Savora Food verification code",
      bodyHtml,
      appUrl: origin,
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

export function buildResetEmail(link: string, minutes = 30, appUrl = "https://savora-food.vercel.app"): BuiltEmail {
  const bodyHtml = `
${emailHeadline("Reset your password")}
${emailCentered("We got a request to reset the password on your Savora Food account. Tap the button below to choose a new one.")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 12px 0;">
  <tr>
    <td align="center" bgcolor="${EMAIL_TOKENS.orange}" style="background:${EMAIL_TOKENS.orange};border-radius:8px;">
      <a href="${esc(link)}" target="_blank" style="display:block;padding:14px 20px;font-family:${EMAIL_SANS};font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">Reset password</a>
    </td>
  </tr>
</table>
${emailCentered(`This link expires in ${minutes} minutes and can only be used once.`, true)}
${emailTextLink(link, "Button not working? Paste this link into your browser")}
<p style="margin:18px 0 0 0;padding-top:16px;border-top:1px solid ${EMAIL_TOKENS.line};font-family:${EMAIL_SANS};font-size:13px;line-height:20px;color:${EMAIL_TOKENS.muted};text-align:center;">
  Didn't ask for this? Ignore this email. Your password stays the same.
</p>
${emailSupportLine(appUrl)}`;
  return {
    subject: "Reset your Savora Food password",
    htmlContent: emailShell({
      preheader: `Your reset link expires in ${minutes} minutes.`,
      title: "Reset your Savora Food password",
      bodyHtml,
      appUrl,
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
