
import { createHmac, timingSafeEqual } from "crypto";

const SESSION_TTL_SECONDS = 60 * 60;

export type UploadSession = {
    userId: string;
    key: string;
    uploadId: string;
    sizeBytes: number;
    contentType: string;
    title: string;
    expiresAt: number;
};

function getSecret() {
    // Keep upload-session signing aligned with the application's NextAuth
    // secret resolution. Some deployments configure JWT_SECRET as the
    // canonical auth secret instead of NEXTAUTH_SECRET.
    const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
        throw new Error(
            "Authentication signing secret is missing or must contain at least 32 characters.",
        );
    }

    return secret;
}

function sign(payload: string) {
    return createHmac("sha256", getSecret())
        .update(payload)
        .digest("base64url");
}

export function createUploadSession(input: Omit<UploadSession, "expiresAt">) {
    const session: UploadSession = {
        ...input,
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    };

    const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
    return `${payload}.${sign(payload)}`;
}

export function verifyUploadSession(token: string, userId: string): UploadSession {
    const [payload, signature, extra] = token.split(".");

    if (!payload || !signature || extra) {
        throw new Error("Invalid upload session.");
    }

    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);

    if (
        expected.length !== received.length ||
        !timingSafeEqual(expected, received)
    ) {
        throw new Error("Invalid upload session signature.");
    }

    let session: UploadSession;

    try {
        session = JSON.parse(
            Buffer.from(payload, "base64url").toString("utf8"),
        );
    } catch {
        throw new Error("Invalid upload session data.");
    }

    if (
        !session.userId ||
        !session.key ||
        !session.uploadId ||
        session.userId !== userId
    ) {
        throw new Error("Upload session does not belong to this user.");
    }

    if (
        !Number.isSafeInteger(session.sizeBytes) ||
        session.sizeBytes <= 0 ||
        !Number.isSafeInteger(session.expiresAt) ||
        session.expiresAt < Math.floor(Date.now() / 1000)
    ) {
        throw new Error("Upload session has expired or is invalid.");
    }

    return session;
}
