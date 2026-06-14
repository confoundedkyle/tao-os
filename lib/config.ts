/**
 * Static, non-secret app configuration — values that are the same across every
 * deployment (so they live in code, not environment variables).
 */
export const config = {
  /** Where users reach the team — shown in the agent library and the footer. */
  contactEmail: "hello@calyflow.ai",
  /** Paid setup/consulting help (the Setup Help page). */
  setupHelp: {
    /** Book a call with Michal — the "I'm interested" CTA. */
    bookingUrl:
      "https://calendar.google.com/appointments/schedules/AcZssZ2inc48EODHiCN3-sg3yZEIcMXgOiM39InNXFdhmaKW87-P9ETcj7iLNUy1Hp7Pt_wbrdflTPFt",
    /** Headline rate, kept here so copy and the page stay in one place. */
    hourlyRateEur: 150,
    minimumHours: 4,
  },
} as const;
