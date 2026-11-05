import nodemailer from "nodemailer";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured. Email delivery is unavailable.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    // Never let a stalled SMTP connection hold a signup request open.
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 8_000,
  });
}

async function deliver(options: nodemailer.SendMailOptions) {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    ...options,
  });
}

export async function sendVerificationEmail(email: string, token: string, baseUrl = appUrl) {
  const url = `${baseUrl.replace(/\/$/, "")}/auth/verify-email?token=${encodeURIComponent(token)}`;

  await deliver({
    to: email,
    subject: "Verify your Studenv account",
    text: [
      "Welcome to Studenv!",
      "",
      "Please verify your email address using this link:",
      url,
      "",
      "This link expires in 1 hour.",
      "If you did not sign up for Studenv, you can ignore this message. No action is needed.",
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#202124;max-width:560px;margin:0 auto;padding:24px"><h2>Welcome to Studenv!</h2><p>We're glad you're here. Verify your email address to finish setting up your account.</p><p style="margin:28px 0"><a href="${url}" target="_self" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Verify email</a></p><p>This verification link expires in <strong>1 hour</strong>.</p><p>If you did not sign up for Studenv, you can ignore this message. No action is needed.</p></div>`,
  });
}
export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${appUrl.replace(/\/$/, "")}/auth/reset-password?token=${encodeURIComponent(token)}`;

  await deliver({
    to: email,
    subject: "Reset your Studenv password",
    text: [
      "We received a request to reset the password for your Studenv account.",
      "",
      "Use the link below to choose a new password:",
      url,
      "",
      "This link expires in 1 hour and can only be used once.",
      "If you did not request a password reset, you can safely ignore this email. Your password will not change.",
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#202124;max-width:560px;margin:0 auto;padding:24px"><h2>Reset your Studenv password</h2><p>We received a request to reset the password for your Studenv account.</p><p style="margin:28px 0"><a href="${url}" target="_self" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Reset password</a></p><p>This link expires in <strong>1 hour</strong> and can only be used once.</p><p>If you did not request a password reset, you can safely ignore this email. Your password will not change.</p></div>`,
  });
}

export async function sendWeeklyDigest(
  email: string,
  payload: { unreadCount: number; highlightedTitles: string[] },
) {
  await deliver({
    to: email,
    subject: "Your weekly Studenv digest",
    text: `You have ${payload.unreadCount} unread items.\n${payload.highlightedTitles.join("\n")}`,
    html: `<p>You have <strong>${payload.unreadCount}</strong> unread items.</p><ul>${payload.highlightedTitles.map((title) => `<li>${title}</li>`).join("")}</ul>`,
  });
}

function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function sendContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  const transport = getTransport();
  const from = process.env.SMTP_FROM || (process.env.SMTP_USER ? { name: "Studenv", address: process.env.SMTP_USER } : undefined);

  if (!transport || !from) {
    throw new Error("Contact email delivery is not configured.");
  }

  const safeName = escapeEmailHtml(input.name);
  const safeEmail = escapeEmailHtml(input.email);
  const safeSubject = escapeEmailHtml(input.subject);
  const safeMessage = escapeEmailHtml(input.message).replace(/\r?\n/g, "<br>");

  await transport.sendMail({
    from,
    to: "maxrouteemail@gmail.com",
    replyTo: { name: input.name, address: input.email },
    subject: `Studenv contact: ${input.subject}`,
    text: [
      "A new message was sent through the Studenv contact form.",
      "",
      `Name: ${input.name}`,
      `Email: ${input.email}`,
      `Subject: ${input.subject}`,
      "",
      input.message,
    ].join("\n"),
    html: `<h2>New Studenv contact message</h2><p><strong>Name:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p><p><strong>Subject:</strong> ${safeSubject}</p><hr><p>${safeMessage}</p>`,
  });
}
