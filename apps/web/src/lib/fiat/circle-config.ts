import { env } from "@/lib/env";

export function getCircleConfig(): {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
} {
  const apiKey = env.CIRCLE_API_KEY ?? "";
  const isProduction = env.CIRCLE_ENV === "production";
  const baseUrl = isProduction
    ? "https://api.circle.com"
    : "https://api-sandbox.circle.com";

  return {
    apiKey,
    baseUrl,
    enabled: !!apiKey,
  };
}
