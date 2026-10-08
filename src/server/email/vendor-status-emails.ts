/**
 * Vendor moderation emails on the shared Savora layout: approved, rejected,
 * suspended, reactivated and manual-override notices. Every builder returns
 * { subject, htmlContent, textContent }; sending goes through the existing
 * Brevo/Resend dispatcher in ../email/index (sendEmail), so no new provider
 * or library is introduced.
 */
import { getEnv } from "../env";
import { sendEmail } from "./index";
import {
  emailCentered,
  emailHeadline,
  emailShell,
  emailSupportLine,
  esc,
  primaryButton,
  type BuiltEmail,
} from "./layout";

export type VendorStatusKind = "APPROVED" | "REJECTED" | "SUSPENDED" | "REACTIVATED" | "OVERRIDDEN";

export type VendorStatusEmailInput = {
  businessName: string;
  ownerName?: string | null;
  reason?: string | null;
  appUrl: string;
};

function reasonBlock(reason?: string | null): string {
  if (!reason?.trim()) return "";
  return emailCentered(`Reason given by our team: ${reason.trim()}`);
}

function dashboardButton(appUrl: string): string {
  return primaryButton(`${appUrl.replace(/\/+$/, "")}/vendor/dashboard`, "Open your dashboard");
}

export function buildVendorStatusEmail(kind: VendorStatusKind, input: VendorStatusEmailInput): BuiltEmail {
  const name = input.businessName.trim() || "your kitchen";
  switch (kind) {
    case "APPROVED": {
      const subject = `${name} is live on Savora Food`;
      const bodyHtml = `
${emailHeadline("You're approved 🎉")}
${emailCentered(`${name} passed review and is now visible to customers. Orders can start coming in — keep your menu and availability up to date.`)}
${dashboardButton(input.appUrl)}
${emailSupportLine(input.appUrl)}`;
      return {
        subject,
        htmlContent: emailShell({ preheader: subject, title: subject, bodyHtml, appUrl: input.appUrl }),
        textContent: `Good news — ${name} is approved and now live on Savora Food. Open your dashboard: ${input.appUrl.replace(/\/+$/, "")}/vendor/dashboard`,
      };
    }
    case "REJECTED": {
      const subject = `Update on your ${name} application`;
      const bodyHtml = `
${emailHeadline("Your application wasn't approved")}
${emailCentered(`Thanks for applying with ${name}. After review we can't list your kitchen right now.`)}
${reasonBlock(input.reason)}
${emailCentered("You can fix the issue and apply again, or reply to this email for help.", true)}
${emailSupportLine(input.appUrl)}`;
      return {
        subject,
        htmlContent: emailShell({ preheader: subject, title: subject, bodyHtml, appUrl: input.appUrl }),
        textContent: `Your kitchen application for ${name} was not approved.${input.reason?.trim() ? ` Reason: ${input.reason.trim()}` : ""} Contact support for details.`,
      };
    }
    case "SUSPENDED": {
      const subject = `${name} has been suspended`;
      const bodyHtml = `
${emailHeadline("Your kitchen is suspended")}
${emailCentered(`${name} is temporarily hidden from customers and can't receive new orders.`)}
${reasonBlock(input.reason)}
${emailCentered("Reply to this email or contact support to resolve this.", true)}
${emailSupportLine(input.appUrl)}`;
      return {
        subject,
        htmlContent: emailShell({ preheader: subject, title: subject, bodyHtml, appUrl: input.appUrl }),
        textContent: `Your kitchen ${name} has been suspended and is hidden from customers.${input.reason?.trim() ? ` Reason: ${input.reason.trim()}` : ""} Contact support.`,
      };
    }
    case "REACTIVATED": {
      const subject = `${name} is live again`;
      const bodyHtml = `
${emailHeadline("You're back online")}
${emailCentered(`${name} has been reactivated and is visible to customers again.`)}
${dashboardButton(input.appUrl)}
${emailSupportLine(input.appUrl)}`;
      return {
        subject,
        htmlContent: emailShell({ preheader: subject, title: subject, bodyHtml, appUrl: input.appUrl }),
        textContent: `${name} has been reactivated and is visible to customers again. Open your dashboard: ${input.appUrl.replace(/\/+$/, "")}/vendor/dashboard`,
      };
    }
    case "OVERRIDDEN": {
      const subject = `${name} is approved (manual review)`;
      const bodyHtml = `
${emailHeadline("You're approved ✅")}
${emailCentered(`Our team manually reviewed ${name} and approved it even though the automatic identity check could not be completed. Your kitchen is now live.`)}
${reasonBlock(input.reason)}
${dashboardButton(input.appUrl)}
${emailSupportLine(input.appUrl)}`;
      return {
        subject,
        htmlContent: emailShell({ preheader: subject, title: subject, bodyHtml, appUrl: input.appUrl }),
        textContent: `${name} was manually reviewed and approved by our team and is now live on Savora Food.${input.reason?.trim() ? ` Note: ${input.reason.trim()}` : ""}`,
      };
    }
  }
}

/**
 * Sends a vendor moderation email via the configured sender (Brevo when
 * BREVO_API_KEY is set). Fire-and-forget from the caller: moderation must
 * succeed even if the email fails, so errors are logged, never thrown.
 */
export async function sendVendorStatusEmail(
  to: string,
  kind: VendorStatusKind,
  input: Omit<VendorStatusEmailInput, "appUrl">,
): Promise<void> {
  const { appUrl } = getEnv();
  const built = buildVendorStatusEmail(kind, { ...input, appUrl });
  try {
    await sendEmail({ to, subject: built.subject, text: built.textContent, html: built.htmlContent });
  } catch (error) {
    // Recipient address stays out of production logs.
    const who = process.env.NODE_ENV === "production" ? "(redacted)" : esc(to);
    console.error(`[email] vendor-${kind.toLowerCase()} to ${who} failed:`, error);
  }
}
