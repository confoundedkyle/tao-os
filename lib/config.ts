/**
 * Static, non-secret app configuration — values that are the same across every
 * deployment (so they live in code, not environment variables).
 */
export const config = {
  /** Where users reach the maintainer — shown in the agent library. */
  contactEmail: "confoundedkyle@gmail.com",
} as const;