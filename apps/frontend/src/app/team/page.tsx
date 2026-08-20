import { redirect } from "next/navigation";

/** Compatibility route: workload is now a filter/summary inside Task Monitoring. */
export default function TeamWorkloadPage() {
  redirect("/tasks");
}
