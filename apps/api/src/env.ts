import { resolve } from "node:path";

// Services run from their own package directory, while the documented `.env`
// lives at the repository root. Variables that are already set always win.
for (const file of [".env", "../../.env"]) {
  try {
    process.loadEnvFile(resolve(process.cwd(), file));
  } catch {
    // The file is optional; real deployments set the environment directly.
  }
}
