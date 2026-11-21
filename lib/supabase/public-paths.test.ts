import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it.each(["/login", "/invite", "/api/bcv", "/api/keep-alive", "/.well-known/jwks.json", "/invite/algo", "/cursos/enfermeria-2026", "/api/public/courses/enfermeria-2026"])(
    "%s es pública",
    (p) => {
      expect(isPublicPath(p)).toBe(true);
    },
  );

  it.each(["/api/keep-alive-admin", "/login-falso", "/invitado", "/api/bcvx", "/dashboard", "/", "/cursosx", "/api/publicx"])(
    "%s no es pública aunque empiece igual",
    (p) => {
      expect(isPublicPath(p)).toBe(false);
    },
  );
});
