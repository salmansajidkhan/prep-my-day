// MSAL device code authentication for Microsoft Graph API

import { PublicClientApplication, DeviceCodeRequest, AuthenticationResult } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_CACHE_PATH = path.join(__dirname, "..", "data", "token-cache.json");

const SCOPES = [
  "Calendars.Read",
  "Chat.ReadWrite",
  "User.Read",
];

// Azure AD app registration — replace with your own or use env vars
const CLIENT_ID = process.env.PREP_MY_DAY_CLIENT_ID || "YOUR_CLIENT_ID";
const AUTHORITY = process.env.PREP_MY_DAY_AUTHORITY || "https://login.microsoftonline.com/common";

let msalClient: PublicClientApplication | null = null;
let cachedToken: AuthenticationResult | null = null;

function getMsalClient(): PublicClientApplication {
  if (!msalClient) {
    msalClient = new PublicClientApplication({
      auth: { clientId: CLIENT_ID, authority: AUTHORITY },
      cache: { cachePlugin: undefined },
    });
    // Load token cache if it exists
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      try {
        const cacheData = fs.readFileSync(TOKEN_CACHE_PATH, "utf-8");
        msalClient.getTokenCache().deserialize(cacheData);
      } catch {
        // Ignore corrupt cache
      }
    }
  }
  return msalClient;
}

function saveTokenCache(): void {
  if (!msalClient) return;
  try {
    const cacheData = msalClient.getTokenCache().serialize();
    const dir = path.dirname(TOKEN_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_CACHE_PATH, cacheData, "utf-8");
  } catch {
    // Non-fatal
  }
}

export interface AuthResult {
  success: boolean;
  message: string;
  deviceCodeMessage?: string;
}

export async function authenticate(
  onDeviceCode?: (message: string) => void,
): Promise<AuthResult> {
  const client = getMsalClient();

  // Try silent first (cached token)
  const accounts = await client.getTokenCache().getAllAccounts();
  if (accounts.length > 0) {
    try {
      const result = await client.acquireTokenSilent({
        account: accounts[0],
        scopes: SCOPES,
      });
      cachedToken = result;
      saveTokenCache();
      return {
        success: true,
        message: `Authenticated as ${result.account?.username ?? "unknown"} (cached token).`,
      };
    } catch {
      // Silent failed, fall through to device code
    }
  }

  // Device code flow
  const request: DeviceCodeRequest = {
    scopes: SCOPES,
    deviceCodeCallback: (response) => {
      if (onDeviceCode) {
        onDeviceCode(response.message);
      }
    },
  };

  try {
    const result = await client.acquireTokenByDeviceCode(request);
    if (result) {
      cachedToken = result;
      saveTokenCache();
      return {
        success: true,
        message: `Authenticated as ${result.account?.username ?? "unknown"}.`,
      };
    }
    return { success: false, message: "Authentication returned no result." };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Authentication failed: ${msg}` };
  }
}

export function getAccessToken(): string | null {
  return cachedToken?.accessToken ?? null;
}

export function isAuthenticated(): boolean {
  if (!cachedToken) return false;
  const expiry = cachedToken.expiresOn;
  if (!expiry) return false;
  return new Date(expiry).getTime() > Date.now();
}

export function getGraphClient(): Client | null {
  const token = getAccessToken();
  if (!token) return null;

  return Client.init({
    authProvider: (done) => {
      done(null, token);
    },
  });
}
