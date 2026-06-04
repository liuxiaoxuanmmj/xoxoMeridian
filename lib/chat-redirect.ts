export function chatRoomRedirectPath(roomId: string, auth: string | null | undefined): string {
  if (!auth) return `/chat/${roomId}`;
  const params = new URLSearchParams({ auth });
  return `/chat/${roomId}?${params.toString()}`;
}
