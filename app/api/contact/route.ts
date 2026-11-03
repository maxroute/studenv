import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendContactMessage } from "@/lib/services/email.service";
import { contactRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getRequestContext } from "@/lib/security/request";
import { addSecurityHeaders } from "@/lib/security/headers";

export const runtime = "nodejs";

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  subject: z.enum([
    "General question",
    "Product feedback",
    "Bug report",
    "Suggestion or feature idea",
    "Partnership or other",
  ]),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(200).optional().default(""),
});

function json(body: unknown, status = 200) {
  return addSecurityHeaders(NextResponse.json(body, { status }));
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ ok: false, error: "Content-Type must be application/json." }, 415);
    }

    const context = getRequestContext(request);
    await checkRateLimit(contactRateLimiter, context.ip ?? "unknown");

    const raw = await request.text();
    if (raw.length > 12_000) {
      return json({ ok: false, error: "Message is too large." }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "Invalid request." }, 400);
    }

    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      const messageIssue = parsed.error.issues.find((issue) => issue.path[0] === "message");
      const emailIssue = parsed.error.issues.find((issue) => issue.path[0] === "email");
      const nameIssue = parsed.error.issues.find((issue) => issue.path[0] === "name");
      const subjectIssue = parsed.error.issues.find((issue) => issue.path[0] === "subject");
      const issue = messageIssue ?? emailIssue ?? nameIssue ?? subjectIssue;
      const errorMessage = messageIssue
        ? "Please write a message of at least 10 characters."
        : emailIssue
          ? "Please enter a valid email address."
          : nameIssue
            ? "Please enter your name (at least 2 characters)."
            : subjectIssue
              ? "Please choose a subject."
              : "Please check the form fields and try again.";
      return json({ ok: false, error: errorMessage }, 400);
    }

    // Silently accept honeypot submissions without sending email.
    if (parsed.data.website) {
      return json({ ok: true, message: "Your message has been sent." });
    }

    await sendContactMessage({
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });

    return json({ ok: true, message: "Your message has been sent. Thank you for contacting Studenv." });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 429) {
      return json({ ok: false, error: "Too many messages. Please try again later." }, 429);
    }
    console.error("[contact] Failed to deliver contact message:", error);
    return json({ ok: false, error: "We couldn't send your message right now. Please try again later." }, 503);
  }
}
