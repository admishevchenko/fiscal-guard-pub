"use client";

import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";

/**
 * Renders a "Sign out" button that submits a form whose action is the
 * `signOut` server action. Using a form (not a client-side fetch) ensures the
 * action always runs on the server and redirects cleanly.
 */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button variant="ghost" size="sm" type="submit">
        Sign out
      </Button>
    </form>
  );
}
