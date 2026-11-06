import Link from "next/link";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="RoutePay — página inicial"
      className={`inline-flex items-center gap-2.5 text-xl font-bold tracking-tight ${light ? "text-white" : "text-ink"}`}
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-ink">
        <svg
          width="23"
          height="23"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 18V9a4 4 0 0 1 4-4h9m-4-4 4 4-4 4M19 12v3a4 4 0 0 1-4 4h-4"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="5" cy="19" r="2" fill="currentColor" />
        </svg>
      </span>
      RoutePay
      <span className="mb-3 size-1.5 rounded-full bg-emerald" />
    </Link>
  );
}
