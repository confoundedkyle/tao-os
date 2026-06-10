import { redirect } from "next/navigation";
import { env } from "@/lib/env";

export default async function SignUpPage() {
  if (env.singleWorkspace) redirect("/sign-in");
  const { SignUp } = await import("@clerk/nextjs");
  return (
    <main className="flex flex-1 items-center justify-center py-16">
      <SignUp />
    </main>
  );
}
