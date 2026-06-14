import { env } from "@/lib/env";
import { signInSingleWorkspace } from "@/lib/actions/auth";
import { Button, Field, inputClass } from "@/components/ui";
import { IconAiSpark } from "@/components/icons";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const errorMessage =
    error === "rate-limited"
      ? "Too many attempts. Wait a minute and try again."
      : error === "invalid-password"
        ? "Incorrect password."
        : error
          ? "Please enter a valid email address."
          : null;

  if (!env.singleWorkspace) {
    const { SignIn } = await import("@clerk/nextjs");
    return (
      <main className="flex flex-1 items-center justify-center py-16">
        <SignIn />
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-panel border border-navy-800/12 bg-white p-8">
        <div className="mb-6 flex items-center gap-2 text-mint-700">
          <IconAiSpark />
          <span className="font-display text-xl font-bold text-navy-900">
            Calyflow
          </span>
        </div>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mb-6 mt-1 text-navy-800/55">
          Single-workspace mode — enter your email to continue.
        </p>
        {errorMessage ? (
          <p className="mb-4 rounded-chip bg-coral-400/15 px-3 py-2 text-sm text-coral-400">
            {errorMessage}
          </p>
        ) : null}
        <form action={signInSingleWorkspace} className="space-y-4">
          <Field label="Email">
            <input
              type="email"
              name="email"
              required
              placeholder="you@agency.com"
              className={inputClass}
            />
          </Field>
          {env.requireSingleWorkspacePassword ? (
            <Field label="Password">
              <input
                type="password"
                name="password"
                required
                placeholder="Workspace password"
                className={inputClass}
              />
            </Field>
          ) : null}
          <Button type="submit" className="w-full justify-center">
            Continue
          </Button>
        </form>
      </div>
    </main>
  );
}
