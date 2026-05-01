import { cookies } from "next/headers";

import { assertRoomCapacity, getDefaultRoomForUser } from "@/lib/access";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { getDemoUserByRole, normalizeDemoRole, USER_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const role = normalizeDemoRole(body.role);
    const user = await getDemoUserByRole(role);

    if (!user) {
      return jsonError("Demo user not found. Run the seed script first.", 404);
    }

    const room = await getDefaultRoomForUser(user);
    await assertRoomCapacity(room.id);

    cookies().set(USER_COOKIE, user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });

    return jsonOk({
      user,
      room
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
