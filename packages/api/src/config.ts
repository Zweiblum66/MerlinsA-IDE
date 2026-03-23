/**
 * Environment configuration for the API server.
 */

export interface ServerConfig {
  port: number;
  host: string;
  dbPath: string;
  jwtSecret: string;
  corsOrigins: string[];
  isProduction: boolean;
}

/**
 * Reads server configuration from environment variables with defaults.
 */
export function loadConfig(): ServerConfig {
  const port = parseInt(process.env["PORT"] ?? "19700", 10);
  const host = process.env["HOST"] ?? "0.0.0.0";
  const dbPath = process.env["DB_PATH"] ?? "";
  const jwtSecret = process.env["JWT_SECRET"] ?? "dev-secret-change-in-production";
  const corsOriginsRaw = process.env["CORS_ORIGINS"] ?? "http://localhost:19701,http://localhost:19700";
  const corsOrigins = corsOriginsRaw.split(",").map((o) => o.trim()).filter(Boolean);
  const isProduction = process.env["NODE_ENV"] === "production";

  return {
    port,
    host,
    dbPath,
    jwtSecret,
    corsOrigins,
    isProduction,
  };
}
