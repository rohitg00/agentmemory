import type { Session } from "./types.js";

export function sessionText(session: Session): string {
  return session.timestamp
    ? "[Source session date: " + session.timestamp + "]\n" + session.content
    : session.content;
}
