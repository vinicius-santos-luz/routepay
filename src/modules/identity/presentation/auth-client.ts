"use client";

import { createAuthClient } from "better-auth/react";

// Same-origin requests. No secrets or server environment are bundled in the client.
export const authClient = createAuthClient();
