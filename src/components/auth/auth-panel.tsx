export function AuthPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[430px] rounded-(--radius-v2-2xl) border border-neutral-200 bg-white p-8 shadow-(--shadow-v2-sm)">
        <div className="mb-8 text-center">
          <h1 className="text-v2-heading-lg text-foreground">{title}</h1>
          <p className="mt-2 text-v2-body-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
