/** Shown in the same frame as the click, while the module's data is still arriving. */
export default function Opening() {
  return (
    <div className="flex h-dvh bg-background text-foreground">
      <aside className="ui-sidebar m-3 mr-0 hidden w-[15.5rem] shrink-0 rounded-[1.75rem] sm:block" />
      <div className="flex min-w-0 flex-1 flex-col px-4 pt-6 sm:px-6">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-foreground/10" />
        <div className="mt-6 grid flex-1 grid-cols-1 content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="h-28 animate-pulse rounded-2xl bg-foreground/10" />
          <div className="h-28 animate-pulse rounded-2xl bg-foreground/10" />
          <div className="h-28 animate-pulse rounded-2xl bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}
