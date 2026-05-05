import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";

/**
 * Shared auth-gate card. Replaces 7 different ad-hoc copies that had drifted
 * apart over time (different titles, body text, button labels, missing
 * `w-full` on the card so it shrank to one-word-per-line on desktop, and one
 * variant that pointed at the wrong `/api/oauth/login` URL — that route 404s).
 *
 * Two variants:
 * - "login"  (default) → "Login Required" + Log in button that fires the OAuth flow
 * - "denied" → "Access Denied" for users who ARE logged in but lack the role
 *   (admin, kitchen). No login button — they're already logged in; they need
 *   to contact someone to be granted the role.
 */
export interface AuthGateProps {
  /** Short reason shown beneath the title. e.g. "to view your profile". */
  reason?: string;
  /** Override the title. Defaults to "Login Required" / "Access Denied". */
  title?: string;
  /** Variant. "denied" hides the login button. */
  variant?: "login" | "denied";
}

export function AuthGate({ reason, title, variant = "login" }: AuthGateProps) {
  const isDenied = variant === "denied";
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>{title ?? (isDenied ? "Access Denied" : "Login Required")}</CardTitle>
          {reason && <CardDescription>{reason}</CardDescription>}
        </CardHeader>
        {!isDenied && (
          <CardContent>
            <Button
              onClick={() => (window.location.href = getLoginUrl())}
              className="w-full"
            >
              Log in
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
