# OSS Atlas Uploads and Login Visuals Design

## Goal

Move Atlas photo storage from the local filesystem to Aliyun OSS in production, while keeping Atlas photos visible only to logged-in users. Replace the single local login background image with a manifest-driven OSS image rotation system that prioritizes stability, usability, and then visual polish.

## Priorities

1. Stability: configuration failures must not break login or Atlas usage.
2. Usability: the login form must stay readable and predictable across all images.
3. Design quality: image rotation and theme gradients can enhance the page, but only within controlled, validated values.

Agent or LLM-based theme generation is out of scope. Theme colors are explicit configuration.

## Current State

Atlas uploads are handled by `lib/atlas-upload.ts`, which writes image files to `ATLAS_UPLOAD_DIR` or `data/atlas-uploads`. `app/api/atlas/uploads/route.ts` stores photo elements with an `imageUrl` like `/api/atlas/uploads/<filename>`. `app/api/atlas/uploads/[filename]/route.ts` requires a logged-in user, reads the local file, and returns the image.

Atlas deletion currently derives a filename from `imageUrl.split("/").pop()` in `app/api/atlas/route.ts` and `app/api/atlas/elements/[elementId]/route.ts`, then deletes the local file.

The login page is rendered from `app/page.tsx`, which returns `AuthPanel`. `components/auth/AuthPanel.tsx` currently references `/images/login-bg.jpg` directly in a background image style.

Environment validation is centralized in `lib/env.ts`, but Atlas upload configuration currently reads `process.env.ATLAS_UPLOAD_DIR` directly.

## Architecture

### Atlas Private Storage

Atlas uses a storage abstraction with two providers:

- `local`: existing filesystem behavior for local development and fallback.
- `aliyun-oss`: production provider backed by a private OSS bucket.

Atlas image access remains application-mediated:

1. The browser requests `/api/atlas/uploads/<objectKey>`.
2. The route verifies the current user with `requireCurrentUser()`.
3. The route reads the object from the active storage provider.
4. The route returns the image with private cache headers.

The client never receives permanent public OSS URLs for Atlas photos. Knowing the image route URL is not sufficient to read the image without a valid session.

The database can continue using `AtlasElement.imageUrl` for compatibility, but its value should remain an internal application URL. The storage layer owns the mapping from internal key to local path or OSS object key.

### Login Visuals

Login visuals use a manifest-driven configuration. The application reads a manifest from `LOGIN_VISUALS_MANIFEST_URL`, validates it, caches it for `LOGIN_VISUALS_CACHE_TTL_SECONDS`, and passes the validated data to `AuthPanel`.

The manifest contains public image URLs and explicit theme values:

```json
{
  "version": 1,
  "intervalMs": 7000,
  "items": [
    {
      "id": "login-01",
      "imageUrl": "https://cdn.example.com/login/login-01.jpg",
      "theme": {
        "accent": "#3a5b22",
        "accentHover": "#2f4a1c",
        "gradientFrom": "#f5f1e9",
        "gradientTo": "#dbe6cf",
        "overlay": "rgba(255,255,255,0.12)"
      }
    }
  ]
}
```

If the manifest is missing, unreachable, invalid, or empty after validation, the application uses a built-in fallback with `/images/login-bg.jpg` and the current green theme.

The login page keeps the form area visually stable. Dynamic theme values affect only controlled surfaces:

- selected tab and submit button accent color;
- hover color for accent controls;
- the right-side image panel gradient or overlay;
- optional subtle surrounding background gradient.

Text color, form layout, input styling, and contrast-sensitive surfaces remain stable.

## Configuration

Add environment variables to `lib/env.ts`, `.env.example`, and Docker compose:

```env
ATLAS_STORAGE_PROVIDER=local
ATLAS_UPLOAD_DIR=data/atlas-uploads

ALIYUN_OSS_REGION=
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_ACCESS_KEY_ID=
ALIYUN_OSS_ACCESS_KEY_SECRET=
ALIYUN_OSS_ENDPOINT=
ALIYUN_OSS_PREFIX=atlas/

LOGIN_VISUALS_MANIFEST_URL=
LOGIN_VISUALS_CACHE_TTL_SECONDS=300
```

`ATLAS_STORAGE_PROVIDER=aliyun-oss` requires the Aliyun OSS variables. Build and test phases should remain lenient in the same style as the existing environment parser.

`LOGIN_VISUALS_MANIFEST_URL` is optional. When absent, the login page uses the built-in fallback.

## Security

Atlas photos must be stored in a private OSS bucket or private prefix. The application must not store or return public OSS URLs for Atlas photos.

OSS credentials must only be used server-side. They must not be exposed through `NEXT_PUBLIC_*` variables or client components.

Login visual images may be public because the login page is public. Login visual manifest data must not contain secrets.

The storage layer must sanitize keys and filenames. Upload validation keeps the existing image MIME allowlist and size limit.

Deletion should be best-effort and non-blocking after database deletion, matching current behavior. Storage deletion failures should be logged without causing user-facing failures after the element has already been removed.

## Error Handling

Atlas upload rejects unsupported MIME types and oversized files with a 400 response, preserving current behavior.

If OSS upload fails, the API returns an error and does not create the Atlas element.

If image read fails because the object does not exist, the image route returns 404.

If login visual manifest loading fails, the app logs the issue server-side and returns the fallback visual configuration. Login must never depend on the external manifest being available.

If individual manifest items are invalid, they are dropped. If no valid items remain, the fallback is used.

## Testing

Add focused tests for:

- storage provider selection and missing configuration validation;
- local storage save/read/delete behavior with temporary directories;
- OSS provider behavior using a mocked client;
- Atlas upload route preserving internal image URLs;
- Atlas image route requiring authentication and reading through the storage abstraction;
- login manifest validation accepting valid configuration;
- login manifest validation rejecting malformed colors, empty image URLs, and incomplete theme objects;
- fallback behavior when manifest loading fails.

Run `npm test` for the implementation. Run `npm run lint` because the implementation touches route handlers and React components.

## Deployment

Production deployments set `ATLAS_STORAGE_PROVIDER=aliyun-oss` and provide OSS credentials. The current Docker bind mount for `data/atlas-uploads` can remain for local provider compatibility, but production Atlas photo persistence moves to OSS.

Existing local Atlas files need a migration path before disabling local storage in production:

1. Enumerate current `AtlasElement.imageUrl` values.
2. Upload corresponding local files to OSS under the configured prefix.
3. Keep the internal application URL shape stable when possible.
4. Verify reads through `/api/atlas/uploads/<key>`.
5. Switch `ATLAS_STORAGE_PROVIDER` to `aliyun-oss`.

Login visual updates require only updating the OSS images and manifest. The app picks up changes after the configured cache TTL.

## Schema Decision

The first implementation does not add a database column. It preserves `AtlasElement.imageUrl` and keeps storing internal application URLs like `/api/atlas/uploads/<key>`. A helper extracts the storage key from that internal URL for read and delete operations. This avoids a Prisma migration and keeps existing snapshots, SSE payloads, and React components compatible.
