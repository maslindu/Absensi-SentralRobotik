import { redirect } from "next/navigation";
import { getSessionInfo } from "@/lib/auth";

export default async function Home() {
  const session = await getSessionInfo();
  redirect(session ? "/dashboard" : "/login");
}
