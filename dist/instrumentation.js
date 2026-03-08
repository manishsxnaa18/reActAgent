"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_node_1 = require("@opentelemetry/sdk-node");
const otel_1 = require("@langfuse/otel");
const langfuseEnabled = process.env.LANGFUSE_ENABLED?.toLowerCase() === "true";
const requiredEnv = ["LANGFUSE_SECRET_KEY", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_BASE_URL"];
if (langfuseEnabled) {
    const missing = requiredEnv.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.warn(`Langfuse instrumentation disabled. Missing environment variables: ${missing.join(", ")}`);
    }
    else {
        const sdk = new sdk_node_1.NodeSDK({
            spanProcessors: [new otel_1.LangfuseSpanProcessor()],
        });
        const startInstrumentation = async () => {
            try {
                await sdk.start();
            }
            catch (error) {
                console.warn("Failed to start Langfuse instrumentation:", error);
            }
        };
        void startInstrumentation();
        const shutdown = async () => {
            try {
                await sdk.shutdown();
            }
            catch (error) {
                console.warn("Error shutting down Langfuse instrumentation:", error);
            }
        };
        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    }
}
