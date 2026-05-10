export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      {/* Sidebar placeholder */}
      <aside className="w-64 border-r bg-muted/40 flex flex-col">
        <div className="p-4 border-b">
          <span className="font-semibold text-lg">Orderly</span>
        </div>
        <nav className="flex-1 p-4">
          <p className="text-sm text-muted-foreground">Sidebar coming soon</p>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
