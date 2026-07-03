import { redirect } from "next/navigation";
import { getSession, getClerkUserName } from "@/lib/auth";
import { getUserPreferences } from "@/lib/queries";
import {
  updatePersonalNameAction,
  updateEmailPrefsAction,
} from "@/lib/actions/personal";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { ToastForm } from "@/components/toast-form";

export default async function PersonalSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [prefs, clerkName] = await Promise.all([
    getUserPreferences(session.workspaceId, session.userId),
    getClerkUserName(session.userId),
  ]);

  // Clerk is authoritative for the name; fall back to the mirrored value
  // (the only source in single-workspace mode).
  const firstName = clerkName.firstName ?? prefs?.first_name ?? "";
  const lastName = clerkName.lastName ?? prefs?.last_name ?? "";

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <h2 className="mb-1 text-xl font-semibold">Your name</h2>
        <p className="mb-4 text-sm text-navy-800/55">
          Used across TAO OS and kept in sync with your account.
        </p>
        <ToastForm
          action={updatePersonalNameAction}
          message="Name saved"
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field label="First name">
            <input
              name="firstName"
              defaultValue={firstName}
              placeholder="Jane"
              className={inputClass}
            />
          </Field>
          <Field label="Last name">
            <input
              name="lastName"
              defaultValue={lastName}
              placeholder="Doe"
              className={inputClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button variant="small" type="submit">
              Save
            </Button>
          </div>
        </ToastForm>
      </Card>

      <Card>
        <h2 className="mb-1 text-xl font-semibold">Email</h2>
        <p className="mb-4 text-sm text-navy-800/55">
          How you present yourself in candidate emails and messages. The Outreach
          Writer uses these details to personalize and sign off your outreach.
        </p>
        <ToastForm
          action={updateEmailPrefsAction}
          message="Email details saved"
          className="grid gap-4"
        >
          <Field
            label="Company name"
            hint="As you'd like to refer to it in emails to candidates."
          >
            <input
              name="companyName"
              defaultValue={prefs?.company_name ?? ""}
              placeholder="Acme Talent"
              className={inputClass}
            />
          </Field>
          <Field label="Company website" hint="Domain only, without https://.">
            <input
              name="companyWebsite"
              defaultValue={prefs?.company_website ?? ""}
              placeholder="acme.com"
              className={inputClass}
            />
          </Field>
          <Field
            label="Signature"
            hint="Plain text only — appended to the emails the Outreach Writer drafts."
          >
            <textarea
              name="signature"
              defaultValue={prefs?.email_signature ?? ""}
              rows={5}
              placeholder={"Jane Doe\nAcme Talent\nacme.com"}
              className={`${inputClass} resize-y font-sans`}
            />
          </Field>
          <div>
            <Button variant="small" type="submit">
              Save
            </Button>
          </div>
        </ToastForm>
      </Card>
    </div>
  );
}
