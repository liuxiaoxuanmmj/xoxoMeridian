import { cookies } from "next/headers";

import { jsonOk } from "@/lib/api";
import { USER_COOKIE, verifySession, isSecureRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Logout policy:
//   - Delete the session from the database
//   - Clear the cookie from the browser
export async function POST() {
  const jar = cookies();
  const token = jar.get(USER_COOKIE)?.value;
  const session = verifySession(token);

  console.log("[Logout API] received logout request, session:", session?.sessionId || "none");

  if (session) {
    // Delete this specific session from database
    console.log("[Logout API] deleting session from database:", session.sessionId);
    await prisma.session.delete({
      where: { id: session.sessionId },
    }).catch((error) => {
      // Session might already be deleted, ignore error
      console.log("[Logout API] session delete error (ignored):", error.message);
    });
    console.log("[Logout API] session deleted successfully");
  }

  // CRITICAL: Must pass the same options (path, secure, etc.) that were used
  // when setting the cookie, otherwise the browser won't delete it properly.
  console.log("[Logout API] clearing cookie");
  jar.delete({
    name: USER_COOKIE,
    path: "/",
    secure: isSecureRequest(),
    sameSite: "lax",
  });

  console.log("[Logout API] logout complete");
  return jsonOk({ ok: true });
}
