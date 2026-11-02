// Home (`/`). Stage-1 placeholder: greeting + recent files. Stage 2 adds the
// capture box, pinned projects and the Inbox preview.

import { Link } from "react-router-dom";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { useMe } from "@/data/auth";
import { useFiles } from "@/data/files";
import { ItemCollection, toCollectionItems } from "@/features/collection";
import { NewMenu } from "./NewMenu";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const me = useMe();
  const files = useFiles({});
  const recent = (files.data ?? [])
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);
  const first = me.data?.firstName?.trim();

  return (
    <PageContainer>
      <PageHeader
        title={first ? `${greeting()}, ${first}` : greeting()}
        subtitle="Pick up where you left off."
        actions={<NewMenu />}
      />
      <section aria-labelledby="home-continue">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="home-continue" className="font-display text-lg font-medium">
            Continue
          </h2>
          <Link to="/files/recent" className="text-xs text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>
        <ItemCollection
          items={toCollectionItems([], recent)}
          loading={files.isPending}
          showLocation
          layoutToggle={false}
          sort={false}
          scope="home"
          ariaLabel="Recent files"
          empty={
            <p className="text-center text-sm text-muted-foreground">
              No files yet — create one with New.
            </p>
          }
        />
      </section>
    </PageContainer>
  );
}
