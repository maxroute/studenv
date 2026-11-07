import assert from "node:assert/strict";
import test from "node:test";
import {
  createCourseNodeSchema,
  createCourseSchema,
  ranganActionSchema,
  updateCourseSchema,
} from "./learning.model";

test("course links accept only public web protocols", () => {
  const base = { title: "JEE Preparation", providerName: "Physics Wallah", courseUrl: "https://pw.live/course" };
  assert.equal(createCourseSchema.safeParse(base).success, true);
  assert.equal(createCourseSchema.safeParse({ ...base, courseUrl: "javascript:alert(1)" }).success, false);
  assert.equal(createCourseSchema.safeParse({ ...base, courseUrl: "file:///etc/passwd" }).success, false);
});

test("course updates require at least one supported field", () => {
  assert.equal(updateCourseSchema.safeParse({}).success, false);
  assert.equal(updateCourseSchema.safeParse({ title: "Updated course" }).success, true);
  assert.equal(updateCourseSchema.safeParse({ title: "Course", isAdmin: true }).success, false);
});

test("course nodes support nested subject, topic, and lecture records", () => {
  const result = createCourseNodeSchema.safeParse({
    parentId: "clx12345678901234567890123",
    type: "lecture",
    title: "Lecture 01 · Newton's Laws",
    originalUrl: "https://provider.example/lecture/1",
  });
  assert.equal(result.success, true);
});

test("Rangan action payloads are bounded and distinguish generation from persistence", () => {
  assert.equal(ranganActionSchema.safeParse({ action: "explain", prompt: "Newton's second law" }).success, true);
  assert.equal(ranganActionSchema.safeParse({ action: "save_to_shelf", title: "Notes", content: "F = ma", materialKind: "notes" }).success, true);
  assert.equal(ranganActionSchema.safeParse({ action: "save_to_shelf", title: "Notes", content: "", materialKind: "notes" }).success, false);
});
