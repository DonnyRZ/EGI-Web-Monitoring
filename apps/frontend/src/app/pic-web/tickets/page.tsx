import { redirect } from "next/navigation";

/** Compatibility route: PIC Web creates and monitors Tasks from one workspace. */
export default function PicWebTasksCompatibilityPage() {
  redirect("/tasks");
}
