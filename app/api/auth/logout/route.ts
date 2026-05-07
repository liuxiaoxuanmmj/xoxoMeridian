import { cookies } from "next/headers";

import { jsonOk } from "@/lib/api";
import { USER_COOKIE } from "@/lib/auth";

export async function POST() {
  cookies().delete(USER_COOKIE);
  return jsonOk({ ok: true });
}
