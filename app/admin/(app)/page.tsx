import { requireAdmin } from "@/lib/auth";
import { Card } from "@/components/admin/ui";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const admin = await requireAdmin();
  return (
    <>
      <div className="admin-band" aria-hidden />
      <p className="mb-2 text-[15px] text-body">Track your sales, orders and stock</p>
      <h1 className="display text-[clamp(1.9rem,1.2rem+3vw,3.5rem)]">Welcome back, {admin.name}</h1>
      <Card className="mt-8">
        <p className="body-lg">Phase 1 foundation is live. Dashboard widgets arrive in phase 2.</p>
      </Card>
    </>
  );
}
