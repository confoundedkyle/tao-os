// Connector catalog — mirrors aiwithmichal.com/store/skills. Activation is
// not built yet; cards render with disabled buttons until each connector ships.

export type ConnectorCategory = "ats" | "crm" | "tool";

export interface Connector {
  name: string;
  category: ConnectorCategory;
  blurb: string;
  /** Provider id matching workspace_connections.provider + the adapter registry.
   *  Present only for connectors with a working backend. */
  provider?: string;
  /** True when the connector can actually be activated (has an adapter). */
  live?: boolean;
  /** How the connector authenticates — drives the Connect affordance. */
  auth?: "oauth" | "apikey";
}

export const CONNECTOR_CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  ats: "ATS",
  crm: "CRM",
  tool: "Tool",
};

export const CONNECTORS: Connector[] = [
  // ATS
  { name: "Ashby", category: "ats", blurb: "Sync roles and candidates from the analytics-first modern ATS.", provider: "ashby", live: true, auth: "apikey" },
  { name: "BreezyHR", category: "ats", blurb: "Pull pipelines from the visual drag-and-drop hiring tool.", provider: "breezyhr", live: true, auth: "apikey" },
  { name: "Greenhouse", category: "ats", blurb: "Sync jobs and candidates from the enterprise hiring standard.", provider: "greenhouse", live: true, auth: "apikey" },
  { name: "JazzHR", category: "ats", blurb: "Import candidates from the SMB-friendly recruiting software." },
  { name: "Lever", category: "ats", blurb: "Sync pipelines from the CRM-style ATS teams love.", provider: "lever", live: true, auth: "apikey" },
  { name: "Loxo", category: "ats", blurb: "Pull candidates from the AI recruiting platform for agencies.", provider: "loxo", live: true, auth: "apikey" },
  { name: "Manatal", category: "ats", blurb: "Import candidates from the affordable AI-recommendation ATS.", provider: "manatal", live: true, auth: "apikey" },
  { name: "Pinpoint", category: "ats", blurb: "Sync roles from the in-house talent acquisition platform." },
  { name: "Recruitee", category: "ats", blurb: "Pull collaborative hiring pipelines straight into your projects.", provider: "recruitee", live: true, auth: "apikey" },
  { name: "Recruiterflow", category: "ats", blurb: "Sync the ATS + CRM built for recruiting firms.", provider: "recruiterflow", live: true, auth: "apikey" },
  { name: "Teamtailor", category: "ats", blurb: "Import candidates from the employer-branding-first ATS.", provider: "teamtailor", live: true, auth: "apikey" },
  { name: "Vincere", category: "ats", blurb: "Sync the recruitment OS popular with staffing agencies." },
  { name: "Workable", category: "ats", blurb: "Pull jobs and candidates from the all-in-one hiring platform.", provider: "workable", live: true, auth: "apikey" },
  { name: "Workday", category: "ats", blurb: "Sync requisitions and candidates from the enterprise HR suite." },
  { name: "Zoho Recruit", category: "ats", blurb: "Import candidates from Zoho's staffing-ready ATS.", provider: "zoho-recruit", live: true, auth: "oauth" },

  // CRM
  { name: "Airtable", category: "crm", blurb: "Sync the flexible candidate and client bases you already run.", provider: "airtable", live: true, auth: "oauth" },
  { name: "Dripify", category: "crm", blurb: "Pull LinkedIn outreach campaigns and replies automatically." },
  { name: "HubSpot", category: "crm", blurb: "Sync client companies, deals, and contacts effortlessly.", provider: "hubspot", live: true, auth: "apikey" },
  { name: "Pipedrive", category: "crm", blurb: "Pull your BD pipeline and client deals into Calyflow.", provider: "pipedrive", live: true, auth: "apikey" },
  { name: "Zoho CRM", category: "crm", blurb: "Sync clients and deals from Zoho's sales suite.", provider: "zoho-crm", live: true, auth: "oauth" },

  // Tools (sourcing & outreach)
  { name: "Apollo", category: "tool", blurb: "Source contact data from the 270M-profile B2B database.", provider: "apollo", live: true, auth: "apikey" },
  { name: "Bright Data", category: "tool", blurb: "Enrich profiles with large-scale public web data.", provider: "brightdata", live: true, auth: "apikey" },
  { name: "ContactOut", category: "tool", blurb: "Find personal emails and phones behind LinkedIn profiles.", provider: "contactout", live: true, auth: "apikey" },
  { name: "Coresignal", category: "tool", blurb: "Enrich candidates with fresh public employment data.", provider: "coresignal", live: true, auth: "apikey" },
  { name: "HireEZ", category: "tool", blurb: "AI outbound sourcing across 800M+ candidate profiles." },
  { name: "Hunter.io", category: "tool", blurb: "Find and verify work email addresses instantly.", provider: "hunter", live: true, auth: "apikey" },
  { name: "Instantly.ai", category: "tool", blurb: "Scale cold email outreach with automated warm-up." },
  { name: "Lemlist", category: "tool", blurb: "Personalised cold outreach sequences that get replies.", provider: "lemlist", live: true, auth: "apikey" },
  { name: "Lusha", category: "tool", blurb: "B2B contact data to reach candidates and clients.", provider: "lusha", live: true, auth: "apikey" },
  { name: "RocketReach", category: "tool", blurb: "Find emails and phones across 700M+ professional profiles.", provider: "rocketreach", live: true, auth: "apikey" },
];
