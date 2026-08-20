import { redirect } from "next/navigation";

/** Compatibility route: business intake is shown as Task in one monitoring workspace. */
export default function TicketsCompatibilityPage() {
  redirect("/tasks");
}
