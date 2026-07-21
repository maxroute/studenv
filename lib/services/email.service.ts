import nodemailer from "nodemailer";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function deliver(options: nodemailer.SendMailOptions) {
  const transport = getTransport();

  if (!transport) {
    console.warn("SMTP is not configured. Skipping email send.", options.subject);
    return;
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM,
    ...options,
  });
}

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${appUrl}/auth/verify-email?token=${token}`;

  await deliver({
    to: email,
    subject: "Verify your Studenv account",
    text: `Welcome to Studenv. Verify your account: ${url}`,
    html: `<p>Welcome to <strong>Studenv</strong>.</p><p><a href="${url}">Verify your account</a></p>`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${appUrl}/auth/reset-password?token=${token}`;

  await deliver({
    to: email,
    subject: "Reset your Studenv password",
    text: `Reset your password: ${url}`,
    html: `<p>Reset your password by clicking the link below.</p><p><a href="${url}">Reset password</a></p>`,
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
