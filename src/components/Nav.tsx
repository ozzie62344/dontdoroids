import Link from "next/link";

const tabs = [
  { href: "/dashboard", label: "Home" },
  { href: "/food", label: "Food" },
  { href: "/workout", label: "Workouts" },
  { href: "/weight", label: "Body" },
];

export default function Nav({ email }: { email?: string | null }) {
  return (
    <header
      className="sticky top-0 z-10 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-950/80 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="font-semibold text-brand-600">
          dontdoroids
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {t.label}
            </Link>
          ))}
          <form action="/auth/signout" method="post">
            <button
              className="ml-2 px-2 py-1 rounded text-neutral-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              type="submit"
              title={email ?? undefined}
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
