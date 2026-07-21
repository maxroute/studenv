import { login } from "../lib/services/auth.service";

async function run() {
  try {
    const user = await login({ email: "test@secondbrain.dev", password: "Test1234!" }, { ip: "127.0.0.1", userAgent: "test" });
    console.log("LOGIN SUCCESS: ", user);
  } catch (err) {
    console.error("LOGIN FAILED: ", err instanceof Error ? err.message : String(err));
  }
}

run();
