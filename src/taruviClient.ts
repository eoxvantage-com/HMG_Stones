import { Client, Functions, Storage } from "@taruvi/sdk";

// Validate required environment variables
const requiredEnvVars = {
  TARUVI_SITE_URL: __TARUVI_SITE_URL__,
  TARUVI_APP_SLUG: __TARUVI_APP_SLUG__,
};

Object.entries(requiredEnvVars).forEach(([key, value]) => {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Please check your .env.local file. See .env.example for required variables.`
    );
  }
});

/**
 * Browser client authenticated exclusively by the platform's user session.
 * Only public site URL, app slug and app title are injected through Vite.
 * Used for Navkit, DataProviders, and direct SDK operations.
 *
 * @example
 * // Use with Refine providers (recommended)
 * import { taruviDataProvider, taruviAuthProvider } from "./providers/refineProviders";
 *
 * @example
 * // Direct SDK usage (advanced)
 * import { taruviClient } from "./taruviClient";
 * const response = await taruviClient.httpClient.get("api/...");
 *
 * @see {@link https://docs.taruvi.com|Taruvi Documentation}
 */
export const taruviClient = (() => {
  try {
    const client = new Client({
      // SDK 1.5.3 requires a non-empty legacy constructor field, but its
      // HttpClient sends ONLY X-Session-Token and Auth uses redirect login.
      // This literal grants no permissions and is deliberately not a key.
      // Do not replace it with a server credential. The installed contract
      // is guarded by taruviClient.safety.test.ts for future SDK upgrades.
      apiKey: "browser-session-only-not-a-credential",
      appSlug: __TARUVI_APP_SLUG__,
      apiUrl: __TARUVI_SITE_URL__,
    });
    // SDK 1.5.3 exports modules separately; bind both to the same session client.
    return Object.assign(client, {
      functions: new Functions(client),
      storage: new Storage(client),
    });
  } catch (error) {
    console.error("Failed to initialize Taruvi Client:", error);
    throw new Error(
      "Taruvi configuration error. Please check your .env.local file. " +
        "See .env.example for required variables."
    );
  }
})();
