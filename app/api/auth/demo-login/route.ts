import { assertRoomCapacity, getDefaultRoomForUser } from "@/lib/access";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { getDemoUserByRole, setSessionCookie, verifyDemoPassword } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { demoLoginSchema, readJsonBody } from "@/lib/validation";

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const limited = enforceRateLimit(request, "demo-login", 5, FIFTEEN_MIN_MS);
    if (limited) return limited;

    const { role, password } = await readJsonBody(request, demoLoginSchema);

    if (!verifyDemoPassword(password)) {
      return jsonError("Invalid credentials", 401);
    }

    const user = await getDemoUserByRole(role);
    if (!user) {
      return jsonError("Invalid credentials", 401);
    }

    const room = await getDefaultRoomForUser(user);
    await assertRoomCapacity(room.id);

    await setSessionCookie(user.id);

    return jsonOk({ user, room });
  } catch (error) {
    return errorToResponse(error);
  }
}
