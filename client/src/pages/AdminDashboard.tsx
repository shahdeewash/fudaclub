/**
 * Admin operations dashboard — the day-to-day cockpit for FÜDA Club ops.
 *
 * Tabs:
 *  - Today          → live KPIs (orders, revenue, members, MRR, coin economy, top items)
 *  - Orders         → live feed of recent orders, refund button per order
 *  - Members        → searchable member list, click to manage (coins, cancel, notes)
 *  - Workplaces     → cluster view, highlights venues close to free-delivery threshold
 *  - Insights       → MRR/churn charts + coin economy report
 *  - Export         → CSV downloads
 *
 * Backed by the new `admin.*` tRPC router. All endpoints throw FORBIDDEN if the
 * user isn't role=admin, so we also gate the page itself in App.tsx and check
 * here on render to redirect non-admins back to /.
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, ShoppingBag, Users, Building2, TrendingUp, Download,
  Coins, RefreshCw, Search, AlertCircle, CheckCircle2, X, FileDown,
  Plus, Minus, Save, DollarSign, Clock, MapPin,
} from "lucide-react";

type Tab = "today" | "orders" | "members" | "workplaces" | "insights" | "promos" | "export";

function fmt(cents: number | null | undefined) {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-AU", { timeZone: "Australia/Darwin", dateStyle: "short", timeStyle: "short" });
}

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("today");

  // Gate
  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Admin only</CardTitle>
            <CardDescription>You need admin role to view this page.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/")} variant="outline" className="w-full">
              Go home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const TABS: Array<{ key: Tab; label: string; icon: any }> = [
    { key: "today", label: "Today", icon: TrendingUp },
    { key: "orders", label: "Orders", icon: ShoppingBag },
    { key: "members", label: "Members", icon: Users },
    { key: "workplaces", label: "Workplaces", icon: Building2 },
    { key: "insights", label: "Insights", icon: DollarSign },
    { key: "promos", label: "Promos", icon: Coins },
    { key: "export", label: "Export", icon: Download },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F0]/30">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#1A1A1A] text-white shadow-md">
        <div className="container max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/admin")}
              className="text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Settings
            </Button>
            <span className="text-xs opacity-50">|</span>
            <h1 className="text-lg font-bold">
              <span className="text-[#C9A84C]">FÜDA</span> Admin
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/")}
            className="border-white/30 text-white hover:bg-white/10"
          >
            View site
          </Button>
        </div>
        {/* Tabs */}
        <nav className="container max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                  active
                    ? "border-[#C9A84C] text-[#C9A84C]"
                    : "border-transparent text-white/70 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="container max-w-7xl mx-auto px-4 py-6">
        {tab === "today" && <TodayTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "members" && <MembersTab />}
        {tab === "workplaces" && <WorkplacesTab />}
        {tab === "insights" && <InsightsTab />}
        {tab === "promos" && <PromosTab />}
        {tab === "export" && <ExportTab />}
      </main>
    </div>
  );
}

// ─── TODAY TAB ────────────────────────────────────────────────────────────────

function TodayTab() {
  const { data, isLoading, refetch } = trpc.admin.getDashboardStats.useQuery(undefined, {
    refetchInterval: 30 * 1000,
  });

  if (isLoading || !data) {
    return <div className="text-center py-20 text-gray-500">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-[#1A1A1A]">Today at a glance</h2>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Orders today" value={String(data.ordersToday)} accent="#1A1A1A" />
        <Kpi label="Revenue today" value={fmt(data.revenueTodayCents)} accent="#C9A84C" />
        <Kpi label="Active members" value={String(data.activeMembers)} accent="#1A1A1A" />
        <Kpi label="Est. MRR" value={fmt(data.mrrCents)} accent="#C9A84C" />
      </div>

      {/* Coin economy card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-[#C9A84C]" /> Coin economy
          </CardTitle>
          <CardDescription>Lifetime issued vs redeemed. Lower redemption rate = better unit economics.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-black">{data.coinsIssued}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mt-1">Issued</div>
            </div>
            <div>
              <div className="text-3xl font-black text-[#C9A84C]">{data.coinsRedeemed}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mt-1">Redeemed</div>
            </div>
            <div>
              <div className="text-3xl font-black">{fmtPct(data.coinRedemptionRate)}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mt-1">Redemption rate</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top items */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 items today</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topItems.length === 0 ? (
            <p className="text-sm text-gray-500">No orders yet today.</p>
          ) : (
            <div className="space-y-2">
              {data.topItems.map(item => (
                <div key={item.name} className="flex items-center justify-between border-b border-gray-100 last:border-0 py-2">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-sm">
                    <Badge variant="outline" className="mr-2">×{item.qty}</Badge>
                    <span className="text-gray-600">{fmt(item.revenueCents)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PrepForecastCard />
    </div>
  );
}

function PrepForecastCard() {
  const { data } = trpc.admin.getPrepForecast.useQuery();
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-[#C9A84C]" /> Tomorrow's prep forecast
        </CardTitle>
        <CardDescription>
          Based on {data.activeMembers} active members and the last {data.sampleSize} {data.tomorrowDayOfWeek}s of order data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-3xl font-black text-[#1A1A1A]">{data.historicalAvgOrdersThisWeekday}</div>
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mt-1">Historical avg</div>
          </div>
          <div>
            <div className="text-3xl font-black text-[#1A1A1A]">{data.memberBasedEstimate}</div>
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mt-1">Member-based</div>
          </div>
          <div>
            <div className="text-4xl font-black text-[#C9A84C]">{data.projectedOrdersTomorrow}</div>
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mt-1">Projected for {data.tomorrowDayOfWeek}</div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-4">
          Member-based assumes 40% of active members order on a given working day. Forecast picks the larger of the two so you don't under-prep on a growth week.
        </p>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Card className="border-2" style={{ borderTopColor: accent, borderTopWidth: "4px" }}>
      <CardContent className="pt-6">
        <div className="text-3xl font-black text-[#1A1A1A]">{value}</div>
        <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

// ─── ORDERS TAB ──────────────────────────────────────────────────────────────

function OrdersTab() {
  const { data, isLoading, refetch } = trpc.admin.listLiveOrders.useQuery(
    { limit: 50 },
    { refetchInterval: 15 * 1000 }
  );
  const utils = trpc.useUtils();
  const refundMut = trpc.admin.refundOrder.useMutation({
    onSuccess: () => {
      toast.success("Refund issued");
      utils.admin.listLiveOrders.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const updateStatus = trpc.admin.updateOrderStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      utils.admin.listLiveOrders.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Status workflow: confirmed → preparing → ready → delivered
  const NEXT_STATUS: Record<string, "confirmed" | "preparing" | "ready" | "delivered"> = {
    pending: "confirmed",
    confirmed: "preparing",
    preparing: "ready",
    ready: "delivered",
  };
  const STATUS_LABEL: Record<string, string> = {
    pending: "Mark confirmed",
    confirmed: "Start preparing",
    preparing: "Mark ready",
    ready: "Mark picked up",
  };

  if (isLoading) return <div className="text-center py-20 text-gray-500">Loading orders…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-[#1A1A1A]">Live orders</h2>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {!data || data.length === 0 ? (
        <p className="text-sm text-gray-500">No orders yet.</p>
      ) : (
        <div className="space-y-3">
          {data.map(order => (
            <Card key={order.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="font-mono font-bold text-base">{order.orderNumber}</span>
                      <Badge variant={order.status === "confirmed" ? "default" : "secondary"}>
                        {order.status}
                      </Badge>
                      <Badge variant="outline">{order.fulfillmentType}</Badge>
                      <span className="text-xs text-gray-500">{fmtDate(order.orderDate)}</span>
                    </div>
                    <div className="text-sm text-gray-700 mb-2">
                      <strong>{order.customerName ?? "Anonymous"}</strong>
                      {order.customerEmail && <span className="text-gray-500"> · {order.customerEmail}</span>}
                      {order.customerVenueName && <span className="text-gray-500"> · {order.customerVenueName}</span>}
                    </div>
                    <div className="text-sm">
                      {order.items.map((it, i) => (
                        <span key={i} className="inline-block mr-3">
                          {it.quantity}× {it.itemName}
                          {it.isFree && <Badge variant="secondary" className="ml-1 text-[10px]">FREE</Badge>}
                        </span>
                      ))}
                    </div>
                    {order.specialInstructions && (
                      <p className="text-xs text-amber-700 mt-2 italic">Note: {order.specialInstructions}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-2">
                    <div className="text-2xl font-black">{fmt(order.total)}</div>
                    {NEXT_STATUS[order.status] && (
                      <Button
                        size="sm"
                        className="text-xs bg-[#C9A84C] hover:bg-[#b89540] text-[#1A1A1A]"
                        onClick={() => updateStatus.mutate({
                          orderId: order.id,
                          status: NEXT_STATUS[order.status],
                        })}
                        disabled={updateStatus.isPending}
                      >
                        {STATUS_LABEL[order.status]} →
                      </Button>
                    )}
                    {order.stripeSessionId && order.status !== "canceled" && order.status !== "delivered" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Refund order ${order.orderNumber}?\n\nThis will refund the Stripe charge and mark the order cancelled.`)) {
                            refundMut.mutate({ orderId: order.id });
                          }
                        }}
                        disabled={refundMut.isPending}
                      >
                        Refund
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MEMBERS TAB ─────────────────────────────────────────────────────────────

function MembersTab() {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const { data, isLoading } = trpc.admin.listMembers.useQuery({
    search: search || undefined,
    limit: 100,
    offset: 0,
  });

  if (isLoading) return <div className="text-center py-20 text-gray-500">Loading members…</div>;

  if (selectedUserId !== null) {
    return <MemberDetail userId={selectedUserId} onBack={() => setSelectedUserId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-[#1A1A1A]">Members</h2>
        <span className="text-sm text-gray-500">{data?.total ?? 0} total</span>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name, email, or venue…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>
      {!data || data.members.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">No members found.</p>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {data.members.map(m => (
            <button
              key={m.userId}
              type="button"
              onClick={() => setSelectedUserId(m.userId)}
              className="w-full text-left p-4 hover:bg-gray-50 transition flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold truncate">{m.name ?? m.email ?? "Anonymous"}</span>
                  <Badge variant={m.subStatus === "active" ? "default" : m.subStatus === "trialing" ? "secondary" : "outline"} className="text-[10px]">
                    {m.subStatus}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{m.planType}</Badge>
                  {m.isFoundingMember && (
                    <Badge className="text-[10px] bg-[#C9A84C] text-[#1A1A1A] hover:bg-[#C9A84C]">FOUNDER</Badge>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {m.email}
                  {m.venueName && <span> · {m.venueName}</span>}
                </div>
                {m.adminNote && (
                  <div className="text-xs text-amber-700 mt-1 italic flex items-start gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" /> {m.adminNote}
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-400 shrink-0">→</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberDetail({ userId, onBack }: { userId: number; onBack: () => void }) {
  const { data, isLoading, refetch } = trpc.admin.getMember.useQuery({ userId });
  const utils = trpc.useUtils();
  const [coinDelta, setCoinDelta] = useState(0);
  const [note, setNote] = useState("");

  const adjustCoins = trpc.admin.adjustMemberCoins.useMutation({
    onSuccess: (r) => {
      toast.success(r.issued > 0 ? `Issued ${r.issued} coin(s)` : `Revoked ${r.revoked} coin(s)`);
      setCoinDelta(0);
      refetch();
      utils.admin.listMembers.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const cancelSub = trpc.admin.cancelMemberSub.useMutation({
    onSuccess: () => {
      toast.success("Subscription cancelled");
      refetch();
      utils.admin.listMembers.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const updateNote = trpc.admin.updateMemberNote.useMutation({
    onSuccess: () => {
      toast.success("Note saved");
      refetch();
      utils.admin.listMembers.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Sync note state when data loads
  useMemo(() => {
    if (data?.user.adminNote !== undefined && data?.user.adminNote !== null) setNote(data.user.adminNote);
  }, [data?.user.adminNote]);

  if (isLoading || !data) return <div className="text-center py-20 text-gray-500">Loading member…</div>;
  const { user, subscription, coins, orders, lifetimeSpendCents, availableCoins } = data;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to members
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{user.name ?? user.email ?? "Anonymous"}</CardTitle>
              <CardDescription>
                {user.email}
                {user.venueName && <span> · {user.venueName}</span>}
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Lifetime</div>
              <div className="text-2xl font-black">{fmt(lifetimeSpendCents)}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Subscription */}
          {subscription ? (
            <div className="rounded-lg border p-4 bg-amber-50/40">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={subscription.status === "active" ? "default" : "outline"}>{subscription.status}</Badge>
                <Badge variant="outline">{subscription.planType}</Badge>
                {subscription.isFoundingMember && (
                  <Badge className="bg-[#C9A84C] text-[#1A1A1A] hover:bg-[#C9A84C]">FOUNDER</Badge>
                )}
              </div>
              <div className="text-sm space-y-1 text-gray-700">
                <div>Joined: {fmtDate(subscription.createdAt as any)}</div>
                {subscription.currentPeriodEnd && (
                  <div>Period ends: {fmtDate(subscription.currentPeriodEnd as any)}</div>
                )}
                {subscription.coinGraceUntil && (
                  <div className="text-amber-700">Coin grace until: {fmtDate(subscription.coinGraceUntil as any)}</div>
                )}
              </div>
              {subscription.status !== "canceled" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Cancel ${user.name ?? "this member"}'s subscription?\n\n10% discount stops immediately. Coins remain spendable until end of paid period.`)) {
                      cancelSub.mutate({ userId });
                    }
                  }}
                  disabled={cancelSub.isPending}
                >
                  Cancel subscription
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border p-4 text-sm text-gray-500">No active subscription.</div>
          )}

          {/* Coins */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-semibold flex items-center gap-2"><Coins className="h-4 w-4 text-[#C9A84C]" /> FÜDA Coins</div>
                <div className="text-sm text-gray-500">{availableCoins} available · {coins.length} lifetime</div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCoinDelta(coinDelta - 1)}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="min-w-[2rem] text-center font-bold">{coinDelta > 0 ? `+${coinDelta}` : coinDelta}</span>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCoinDelta(coinDelta + 1)}>
                  <Plus className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  className="ml-2 bg-[#C9A84C] text-[#1A1A1A] hover:bg-[#b89540]"
                  onClick={() => coinDelta !== 0 && adjustCoins.mutate({ userId, delta: coinDelta })}
                  disabled={coinDelta === 0 || adjustCoins.isPending}
                >
                  Apply
                </Button>
              </div>
            </div>
            <p className="text-xs text-gray-500">+ to issue (goodwill / gift), − to revoke (fraud / mistake). Issued coins use the standard weekly-bucket expiry.</p>
          </div>

          {/* Note */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">Admin note</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateNote.mutate({ userId, note })}
                disabled={updateNote.isPending || note === (user.adminNote ?? "")}
              >
                <Save className="h-3 w-3 mr-1" /> Save
              </Button>
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VIP, allergy, problem customer, etc. Members never see this."
              className="text-sm"
              rows={3}
            />
          </div>

          {/* Recent orders */}
          <div className="rounded-lg border p-4">
            <div className="font-semibold mb-2">Last {orders.length} orders</div>
            {orders.length === 0 ? (
              <p className="text-sm text-gray-500">No orders yet.</p>
            ) : (
              <div className="space-y-1 text-sm">
                {orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between py-1">
                    <span className="font-mono text-xs">{o.orderNumber}</span>
                    <span className="text-xs text-gray-500">{fmtDate(o.orderDate as any)}</span>
                    <span className="font-semibold">{fmt(o.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── WORKPLACES TAB ──────────────────────────────────────────────────────────

function WorkplacesTab() {
  const { data, isLoading } = trpc.admin.listWorkplaceClusters.useQuery();

  if (isLoading) return <div className="text-center py-20 text-gray-500">Loading workplaces…</div>;
  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-500 py-10 text-center">No member venues yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-[#1A1A1A]">Workplace clusters</h2>
        <span className="text-sm text-gray-500">{data.length} venues</span>
      </div>
      <Card className="bg-amber-50/60 border-amber-200">
        <CardContent className="pt-6 text-sm">
          <p className="font-semibold mb-1">💡 Sales opportunity</p>
          <p className="text-gray-700">Workplaces with <strong>4 active members</strong> are one signup away from unlocking free delivery. Highlighted below in amber — reach out to those teams!</p>
        </CardContent>
      </Card>
      <div className="bg-white rounded-lg border divide-y">
        {data.map((c, i) => (
          <div
            key={i}
            className={`p-4 flex items-center justify-between gap-4 ${
              c.oneAwayFromFree ? "bg-amber-50" : ""
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="truncate">{c.venueName}</span>
                {c.qualifiesForFreeDelivery && (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Free delivery active</Badge>
                )}
                {c.oneAwayFromFree && (
                  <Badge className="bg-amber-200 text-amber-900 hover:bg-amber-200">1 away</Badge>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-black text-[#1A1A1A]">{c.activeCount}</div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">active</div>
              {c.canceledCount > 0 && (
                <div className="text-[10px] text-gray-400">+{c.canceledCount} cancelled</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── INSIGHTS TAB ────────────────────────────────────────────────────────────

function InsightsTab() {
  const { data, isLoading } = trpc.admin.getDashboardStats.useQuery();
  if (isLoading || !data) return <div className="text-center py-20 text-gray-500">Loading insights…</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black text-[#1A1A1A]">Insights</h2>

      {/* MRR + churn */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Estimated MRR</CardDescription>
            <CardTitle className="text-3xl">{fmt(data.mrrCents)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-500">
            Based on active subs at full plan rate. Trial counts at $80, fortnightly ≈ $385/mo, monthly = $350.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Active members</CardDescription>
            <CardTitle className="text-3xl">{data.activeMembers}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-500">
            Out of {data.totalEverSubs} total ever signed up.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Churn rate</CardDescription>
            <CardTitle className="text-3xl">{fmtPct(data.churnRate)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-500">
            {data.canceledMembers} cancelled / {data.totalEverSubs} total.
          </CardContent>
        </Card>
      </div>

      {/* Coin economy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-[#C9A84C]" /> Coin economy
          </CardTitle>
          <CardDescription>Higher redemption = members getting more value. Lower = better margins for FÜDA. Aim for 50–70%.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-black">{data.coinsIssued}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mt-1">Issued lifetime</div>
            </div>
            <div>
              <div className="text-3xl font-black text-[#C9A84C]">{data.coinsRedeemed}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mt-1">Redeemed lifetime</div>
            </div>
            <div>
              <div className="text-3xl font-black">{fmtPct(data.coinRedemptionRate)}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mt-1">Redemption rate</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ReferralLeaderboardCard />
    </div>
  );
}

function ReferralLeaderboardCard() {
  const { data } = trpc.admin.getReferralLeaderboard.useQuery({ limit: 10 });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Referral leaderboard</CardTitle>
        <CardDescription>Top members by successful referrals (referee has an active subscription).</CardDescription>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <p className="text-sm text-gray-500">No referrals yet.</p>
        ) : (
          <div className="space-y-2">
            {data.map((r, i) => (
              <div key={r.userId} className="flex items-center justify-between border-b border-gray-100 last:border-0 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[#C9A84C] text-[#1A1A1A] font-black text-sm flex items-center justify-center shrink-0">
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{r.name}</div>
                    <div className="text-xs text-gray-500 truncate">{r.email}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-black text-[#1A1A1A]">{r.active}</div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">active</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── PROMOS TAB ──────────────────────────────────────────────────────────────

function PromosTab() {
  const { data, refetch } = trpc.admin.listLtOffers.useQuery();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const createMut = trpc.admin.createLtOffer.useMutation({
    onSuccess: () => {
      toast.success("Offer created");
      refetch();
      utils.fudaClub.getActiveLtOffers.invalidate();
      setShowForm(false);
      setTitle(""); setBody(""); setCtaText(""); setCtaUrl(""); setStartsAt(""); setEndsAt("");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMut = trpc.admin.updateLtOffer.useMutation({
    onSuccess: () => { refetch(); utils.fudaClub.getActiveLtOffers.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = trpc.admin.deleteLtOffer.useMutation({
    onSuccess: () => { toast.success("Offer deleted"); refetch(); utils.fudaClub.getActiveLtOffers.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-[#1A1A1A]">Promos &amp; Offers</h2>
        <Button onClick={() => setShowForm(!showForm)} className="bg-[#C9A84C] text-[#1A1A1A] hover:bg-[#b89540]">
          {showForm ? "Cancel" : "+ New offer"}
        </Button>
      </div>
      <Card className="bg-blue-50/40 border-blue-200">
        <CardContent className="pt-6 text-sm">
          <p className="font-semibold mb-1">💡 How LTO banners work</p>
          <p className="text-gray-700">Active offers (within their time window) show as a banner at the top of the menu page. Use them for weekly specials, holiday promos, "free upgrade" deals, etc.</p>
        </CardContent>
      </Card>
      {showForm && (
        <Card>
          <CardHeader><CardTitle>New offer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Title — e.g. Free upgrade to large bubble tea this week!" value={title} onChange={e => setTitle(e.target.value)} />
            <Textarea placeholder="Body — short message body" value={body} onChange={e => setBody(e.target.value)} rows={3} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="CTA text (optional) — e.g. Order now" value={ctaText} onChange={e => setCtaText(e.target.value)} />
              <Input placeholder="CTA URL (optional) — /menu" value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1">Starts</label>
                <Input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">Ends</label>
                <Input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
              </div>
            </div>
            <Button
              onClick={() => createMut.mutate({
                title, body,
                ctaText: ctaText || undefined,
                ctaUrl: ctaUrl || undefined,
                startsAt: new Date(startsAt).toISOString(),
                endsAt: new Date(endsAt).toISOString(),
              })}
              disabled={createMut.isPending || !title || !body || !startsAt || !endsAt}
              className="bg-[#C9A84C] text-[#1A1A1A] hover:bg-[#b89540]"
            >
              Create offer
            </Button>
          </CardContent>
        </Card>
      )}
      {!data || data.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">No offers yet.</p>
      ) : (
        <div className="space-y-3">
          {data.map(o => {
            const now = new Date();
            const isLive = o.isActive && new Date(o.startsAt) <= now && new Date(o.endsAt) >= now;
            return (
              <Card key={o.id} className={isLive ? "border-2 border-[#C9A84C]" : ""}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold">{o.title}</span>
                        {isLive ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">LIVE</Badge>
                        ) : !o.isActive ? (
                          <Badge variant="outline">Paused</Badge>
                        ) : (
                          <Badge variant="outline">Scheduled / expired</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{o.body}</p>
                      <div className="text-xs text-gray-500">
                        {fmtDate(o.startsAt)} → {fmtDate(o.endsAt)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => updateMut.mutate({ id: o.id, isActive: !o.isActive })}>
                        {o.isActive ? "Pause" : "Activate"}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                        if (confirm("Delete this offer permanently?")) deleteMut.mutate({ id: o.id });
                      }}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── EXPORT TAB ──────────────────────────────────────────────────────────────

function ExportTab() {
  const utils = trpc.useUtils();

  async function downloadCsv(kind: "orders" | "members") {
    try {
      const res = await utils.admin.exportCsv.fetch({ kind });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${res.filename}`);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black text-[#1A1A1A]">Export</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" /> Orders
            </CardTitle>
            <CardDescription>All orders with totals, customer, venue, and status. Last 5,000 rows.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => downloadCsv("orders")} className="w-full">
              <FileDown className="h-4 w-4 mr-2" /> Download orders.csv
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Members
            </CardTitle>
            <CardDescription>All FÜDA Club members with plan, status, venue, founding flag, admin notes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => downloadCsv("members")} className="w-full">
              <FileDown className="h-4 w-4 mr-2" /> Download members.csv
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
