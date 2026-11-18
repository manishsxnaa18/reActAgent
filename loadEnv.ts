import dotenv from "dotenv";

// Real credentials live in .envReal (gitignored). .env is a committed blank template.
// Values from .envReal take precedence; .env fills in anything missing.
dotenv.config({ path: [".envReal", ".env"] });
