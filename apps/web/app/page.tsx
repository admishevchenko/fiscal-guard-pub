import { redirect } from "next/navigation";

/**
 * Root page — middleware handles the authenticated/unauthenticated redirect,
 * but this fallback ensures we never render a blank page.
 */
export default function RootPage() {
  redirect("/login");
}
