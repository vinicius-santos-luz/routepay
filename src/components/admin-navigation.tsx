"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui/icon";

export function AdminNavigation() {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {(
        [
          { href: "/dashboard", label: "Visão geral", icon: "grid" },
          {
            href: "/dashboard/organizations",
            label: "Organizações",
            icon: "building",
          },
        ] as const
      ).map(({ href, label, icon }) => {
        const active =
          pathname === href ||
          (href !== "/dashboard" && pathname.startsWith(`${href}/`));
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold ${active ? "bg-accent/40 text-emerald" : "text-muted"}`}
            >
              <Icon name={icon} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
