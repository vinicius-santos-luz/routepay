import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin-shell";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Visão geral",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSession();
  return <AdminShell>{children}</AdminShell>;
}
