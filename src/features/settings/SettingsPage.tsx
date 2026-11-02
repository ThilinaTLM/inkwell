// Settings at /settings — one calm page: Profile · Appearance · Admin
// (admins only) · About. `#anchor` and `/settings/:section` both scroll to
// the matching card; a small pill nav at the top jumps between them.

import { useEffect } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { useMe } from "@/data/auth";
import { AdminSection } from "@/features/admin/AdminSection";
import { cn } from "@/lib/utils";
import { AboutSection } from "./sections/AboutSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { ProfileSection } from "./sections/ProfileSection";

const SECTIONS = ["profile", "appearance", "admin", "about"] as const;
type SectionId = (typeof SECTIONS)[number];

// Retired section ids from the old multi-pane Settings.
const LEGACY: Record<string, SectionId> = { security: "profile" };

export function SettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const { hash } = useLocation();
  const me = useMe();
  const isAdmin = !!me.data?.isAdmin;
  const ready = !!me.data;

  const target = (section ? (LEGACY[section] ?? section) : hash.slice(1)) as string;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll once content is mounted
  useEffect(() => {
    if (!ready || !target) return;
    const el = document.getElementById(target);
    if (el && (SECTIONS as readonly string[]).includes(target)) {
      // Scroll only the page's own scroller (scrollIntoView can nudge the
      // whole document when the shell is slightly taller than the viewport).
      const scroller = el.closest<HTMLElement>(".overflow-y-auto");
      if (scroller) {
        const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTo({ top: scroller.scrollTop + top - 24, behavior: "smooth" });
      }
    }
  }, [target, ready, isAdmin]);

  if (section && !(SECTIONS as readonly string[]).includes(LEGACY[section] ?? section)) {
    return <Navigate to="/settings" replace />;
  }
  if (!me.data) return null;

  const nav = SECTIONS.filter((s) => s !== "admin" || isAdmin);

  return (
    <PageContainer className="relative max-w-[760px]">
      <PageHeader title="Settings" subtitle="Your account and how Inkwell looks on this device." />
      <nav aria-label="Settings sections" className="-mt-2 mb-5 flex flex-wrap gap-1.5">
        {nav.map((s) => (
          <Link
            key={s}
            to={`/settings#${s}`}
            replace
            className={cn(
              "rounded-full border border-border px-3 py-1 text-[13px] text-muted-foreground capitalize outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
              target === s && "border-primary/40 bg-accent-soft text-accent-text",
            )}
          >
            {s}
          </Link>
        ))}
      </nav>
      <div className="grid gap-5">
        <ProfileSection user={me.data} />
        <AppearanceSection />
        {isAdmin ? <AdminSection selfId={me.data.id} /> : null}
        <AboutSection />
      </div>
    </PageContainer>
  );
}
