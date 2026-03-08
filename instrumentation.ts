import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

const langfuseEnabled = process.env.LANGFUSE_ENABLED?.toLowerCase() === "true";
const requiredEnv = ["LANGFUSE_SECRET_KEY", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_BASE_URL"] as const;

if (langfuseEnabled) {
  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.warn(
      `Langfuse instrumentation disabled. Missing environment variables: ${missing.join(", ")}`
    );
  } else {
    const sdk = new NodeSDK({
      spanProcessors: [new LangfuseSpanProcessor()],
    });

    const startInstrumentation = async () => {
      try {
        await sdk.start();
      } catch (error: unknown) {
        console.warn("Failed to start Langfuse instrumentation:", error);
      }
    };

    void startInstrumentation();

    const shutdown = async () => {
      try {
        await sdk.shutdown();
      } catch (error) {
        console.warn("Error shutting down Langfuse instrumentation:", error);
      }
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }
}