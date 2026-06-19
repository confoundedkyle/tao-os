"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { db } from "../db";

/** Hide the sidebar DEMO section for this workspace. Reversible (the demo rows
 *  stay in place); any member can dismiss it. */
export async function hideDemoProjectAction(): Promise<void> {
  const session = await requireSession();
  await db()
    .from("workspaces")
    .update({ demo_hidden: true })
    .eq("id", session.workspaceId);
  revalidatePath("/", "layout");
}
