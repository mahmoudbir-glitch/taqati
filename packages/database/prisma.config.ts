import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma runs from this package, while the documented `.env` is at the repository root.
config({ path: [".env", "../../.env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
