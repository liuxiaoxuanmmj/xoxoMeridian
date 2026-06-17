import { lookupViaCity } from "city-timezones";

import { applyNoStoreHeaders, errorToResponse, jsonOk } from "@/lib/api";
import { getCurrentUser, requireCurrentUser } from "@/lib/auth";
import { normalizeCityName, normalizeCountryName } from "@/lib/geo-normalize";
import { prisma } from "@/lib/prisma";
import { profileUpdateSchema, readJsonBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Lightweight probe used by the login form / cookie-overwrite watchdog to
// confirm both that a session cookie persisted AND that it still resolves to
// the user the client expects.
//
//   ?expect=<userId>  — return 401 instead of 200 when the cookie's userId
//                       doesn't match. Used by SessionHeartbeat / ChatApp to
//                       detect same-device cookie clobber by another tab.
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      const response = new Response("Unauthorized", { status: 401 });
      applyNoStoreHeaders(response.headers);
      return response;
    }

    const expect = new URL(request.url).searchParams.get("expect");
    if (expect && expect !== user.id) {
      const response = new Response("Unauthorized", { status: 401 });
      applyNoStoreHeaders(response.headers);
      return response;
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: {
        city: true,
        country: true,
        timezone: true,
        profileNote: true,
      },
    });

    const response = jsonOk({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarLabel: user.avatarLabel,
      profile,
    });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const response = errorToResponse(error);
    applyNoStoreHeaders(response.headers);
    return response;
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await readJsonBody(request, profileUpdateSchema);

    const userUpdate: { displayName?: string; avatarLabel?: string } = {};
    if (body.displayName !== undefined) {
      userUpdate.displayName = body.displayName;
      userUpdate.avatarLabel = body.displayName.slice(0, 2);
    }

    const profileUpdate: {
      profileNote?: string | null;
      city?: string;
      country?: string;
      timezone?: string;
      geoSource?: string;
    } = {};
    if (body.profileNote !== undefined) {
      // Persist empty strings as null so the agent injection branch can use a
      // simple null check.
      profileUpdate.profileNote = body.profileNote.length === 0 ? null : body.profileNote;
    }
    if (body.city !== undefined) {
      profileUpdate.city = body.city;

      // 自动查找并更新时区
      if (body.city) {
        const normalizedCity = normalizeCityName(body.city);
        const cityLookup = lookupViaCity(normalizedCity);
        if (cityLookup.length > 0) {
          // 如果提供了 country，优先匹配同国家的城市
          const countryToMatch = normalizeCountryName(body.country) ?? normalizeCountryName(
            (await prisma.userProfile.findUnique({
              where: { userId: user.id },
              select: { country: true }
            }))?.country
          );

          const match = countryToMatch
            ? cityLookup.find(c => c.country.toLowerCase() === countryToMatch.toLowerCase()) ?? cityLookup[0]
            : cityLookup[0];
          profileUpdate.timezone = match.timezone;
        }
      }
    }
    if (body.country !== undefined) profileUpdate.country = body.country;
    if (body.timezone !== undefined) profileUpdate.timezone = body.timezone;

    // 用户手动修改 city 或 country 后，后续自动同步不再覆盖
    if (body.city !== undefined || body.country !== undefined) {
      profileUpdate.geoSource = "manual";
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({ where: { id: user.id }, data: userUpdate });
      }
      if (Object.keys(profileUpdate).length > 0) {
        await tx.userProfile.update({
          where: { userId: user.id },
          data: profileUpdate,
        });
      }
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
