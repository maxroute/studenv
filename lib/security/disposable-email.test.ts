import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getErrorResponse } from "@/lib/security/request";
import {
  DISPOSABLE_EMAIL_MESSAGE,
  assertNotDisposableEmail,
  emailDomain,
  isDisposableDomain,
  isDisposableEmail,
} from "@/lib/security/disposable-email";

describe("disposable email check", () => {
  it("blocks well-known temporary inbox domains", () => {
    for (const email of [
      "someone@mailinator.com",
      "someone@guerrillamail.com",
      "someone@10minutemail.com",
      "someone@yopmail.com",
      "someone@temp-mail.org",
    ]) {
      assert.equal(isDisposableEmail(email), true, email);
    }
  });

  it("blocks subdomains of a listed domain", () => {
    assert.equal(isDisposableEmail("someone@x.mailinator.com"), true);
    assert.equal(isDisposableEmail("someone@a.b.mailinator.com"), true);
    assert.equal(isDisposableDomain("inbox.yopmail.com"), true);
  });

  it("ignores case and a trailing dot", () => {
    assert.equal(isDisposableEmail("Someone@MAILINATOR.com"), true);
    assert.equal(isDisposableEmail("someone@mailinator.com."), true);
    assert.equal(isDisposableEmail("  someone@Mailinator.Com..  "), true);
    assert.equal(emailDomain("a@Example.ORG."), "example.org");
  });

  it("allows ordinary and college addresses", () => {
    for (const email of [
      "student@gmail.com",
      "student@outlook.com",
      "student@yahoo.co.in",
      "student@icloud.com",
      "student@proton.me",
      "student@stanford.edu",
      "student@iitb.ac.in",
      "student@cs.ox.ac.uk",
    ]) {
      assert.equal(isDisposableEmail(email), false, email);
    }
  });

  it("does not match a domain that only ends with a listed name", () => {
    // "studenvmailinator.com" is not a subdomain of "mailinator.com".
    assert.equal(isDisposableDomain("studenvmailinator.com"), false);
    assert.equal(isDisposableDomain("mailinator.com.example.org"), false);
  });

  it("treats malformed input as not disposable instead of throwing", () => {
    assert.equal(isDisposableEmail("no-at-sign"), false);
    assert.equal(isDisposableEmail("someone@"), false);
    assert.equal(isDisposableDomain("com"), false);
    assert.equal(isDisposableDomain(""), false);
  });

  it("rejects with the friendly message as a safe 400", () => {
    assert.doesNotThrow(() => assertNotDisposableEmail("student@gmail.com"));

    let caught: unknown;
    try {
      assertNotDisposableEmail("someone@mailinator.com");
    } catch (error) {
      caught = error;
    }

    const response = getErrorResponse(caught);
    assert.equal(response.status, 400);
    assert.equal(response.message, DISPOSABLE_EMAIL_MESSAGE);
    assert.deepEqual(response.details, {
      issues: [{ path: "email", message: DISPOSABLE_EMAIL_MESSAGE }],
    });
  });
});
