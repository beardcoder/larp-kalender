import { redirect } from "next/navigation";
import { currentUser, isStaff } from "@/lib/server/auth.ts";
import { LoginForm } from "./LoginForm.tsx";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (isStaff(await currentUser())) redirect("/admin");
  return <LoginForm />;
}
