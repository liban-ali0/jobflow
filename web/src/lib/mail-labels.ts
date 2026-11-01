import type { MailKind } from "./types";

// What an email about an application says, as the app shows it.
export const MAIL_KIND_LABELS: Record<MailKind, string> = {
  interview: "Interview invitation",
  offer: "Offer",
  rejected: "Rejection",
  action: "They ask you to do something",
  received: "Application received",
  replied: "Reply",
};
