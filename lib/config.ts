/**
 * Static, non-secret app configuration — values that are the same across every
 * deployment (so they live in code, not environment variables).
 */
export const config = {
  /** Where users reach the team — shown in the agent library and the footer. */
  contactEmail: "hello@calyflow.ai",
} as const;
