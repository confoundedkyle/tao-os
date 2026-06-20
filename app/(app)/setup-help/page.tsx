import { config } from "@/lib/config";
import { ButtonLink, Card, Chip, PageHeader } from "@/components/ui";
import { IconAiSpark } from "@/components/icons";

export const metadata = {
  title: "Setup Help — Calyflow",
};

const { bookingUrl, setupPriceEur } = config.setupHelp;

const STEPS = [
  {
    title: "We learn your desk",
    body: "Roles you fill, your clients, your sourcing channels, and the tools you already use.",
  },
  {
    title: "We configure Calyflow with you",
    body: "Knowledge base, client setup, agents, connectors, and email details — wired to how you actually work.",
  },
  {
    title: "You run it yourself",
    body: "We hand over a working setup and the playbook to keep going, so you're not dependent on us.",
  },
];

export default function SetupHelpPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Setup Help"
        description="Want this running for your agency without the trial and error? Our team will set it up with you."
      />

      <div className="grid gap-6">
        <Card featured>
          <Chip tone="amber">For agency owners &amp; busy recruiters</Chip>
          <h2 className="mt-3 text-2xl font-bold leading-snug">
            Calyflow is powerful, but the first setup takes know-how.
          </h2>
          <p className="mt-3 text-navy-800/70">
            Most of the value comes from configuring it right — the knowledge
            base, your clients, the agents, your connectors, and your email
            details. Get that wrong and the output is generic. Get it right and
            it works like a teammate who already knows your desk.
          </p>
          <p className="mt-3 font-medium text-navy-900">
            You don&apos;t have to figure it out alone. We&apos;ll do it with
            you on a call and leave you with a working system.
          </p>
        </Card>

        <Card>
          <h2 className="mb-4 text-xl font-semibold">How it works</h2>
          <ol className="grid gap-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-mint-400/20 text-sm font-bold text-mint-700">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-navy-900">{step.title}</p>
                  <p className="text-sm text-navy-800/65">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <h2 className="mb-1 text-xl font-semibold">What it costs</h2>
          <p className="mb-4 text-sm text-navy-800/55">
            Straightforward, no surprises.
          </p>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-4xl font-bold text-navy-900">
              €{setupPriceEur.toLocaleString("en-US")}
            </span>
            <span className="ml-1 text-navy-800/55">
              · agents workspace setup
            </span>
          </div>
          <p className="mt-3 text-sm text-navy-800/65">
            A flat price to get your agents workspace set up properly — done with
            you, end to end. We&apos;ll confirm the scope with you on the call
            before you commit to anything.
          </p>
        </Card>

        <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <IconAiSpark size={20} className="text-mint-700" />
              Ready to set it up properly?
            </h2>
            <p className="mt-1 text-sm text-navy-800/65">
              Book a quick call with Michal Juhas. No commitment — we&apos;ll
              tell you straight whether it&apos;s worth it for you.
            </p>
          </div>
          <ButtonLink
            href={bookingUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0"
          >
            Book a call with Michal
          </ButtonLink>
        </Card>
      </div>
    </div>
  );
}
