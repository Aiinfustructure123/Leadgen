import { serve } from "inngest/next";

import { functions, inngest } from "@/lib/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
