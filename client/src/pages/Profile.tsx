import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthGate } from "@/components/AuthGate";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  User,
  Mail,
  Star,
  Coins,
  Calendar,
  Snowflake,
  CheckCircle,
  Copy,
  Home,
  UtensilsCrossed,
  ShoppingBag,
  LogOut,
  CreditCard,
  AlertCircle,
} from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  trial: "7-Day Trial",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
};

const PLAN_PRICES: Record<string, string> = {
  trial: "$80 first fortnight, then $180/2 weeks",
  fortnightly: "$180 every 2 weeks",
  monthly: "$350 per month",
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Darwin",
  });
}

export default function Profile() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const { data: clubStatus, isLoading: clubLoading } = trpc.fudaClub.getStatus.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: coinHistory } = trpc.fudaClub.getCoinHistory.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: venueStatus } = trpc.fudaClub.getVenueStatus.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Logged out successfully");
      window.location.href = "/";
    },
  });

  const referralCode = (user as any)?.referralCode ?? null;
  const referralLink = useMemo(() => {
    if (!referralCode) return "";
    return `${window.location.origin}/fuda-club?ref=${referralCode}`;
  }, [referralCode]);

  function copyReferral() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied!");
  }

  if (!isAuthenticated) {
    return <AuthGate reason="Please log in to view your profile." />;
  }

  if (clubLoading) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const sub = clubStatus?.subscription;
  const isClubMember = !!(sub && sub.status !== "canceled");
  const planType = sub?.planType ?? "trial";
  const isFrozen = sub?.status === "frozen";
  const coinBalance = clubStatus?.coinBalance ?? 0;
  const usedCoinsCount = (coinHistory ?? []).filter((c: any) => c.isUsed).length;
  const totalCoinsIssued = (coinHistory ?? []).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-80 transition"
          >
            <span className="text-amber-500">FÜDA</span>
            <span className="text-xs text-muted-foreground font-normal hidden sm:inline">
              Profile
            </span>
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setLocation("/menu")} className="gap-1.5">
              <UtensilsCrossed className="h-4 w-4" />
              <span className="hidden sm:inline">Menu</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLocation("/")} aria-label="Back to home" className="gap-1.5">
              <Home className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto py-8 px-4 space-y-5">
        {/* Onboarding nudge banner — context-aware welcome / trial-ending / etc. */}
        <OnboardingNudge />

        {/* Header — name + role */}
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl font-bold">
            {(user?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{user?.name ?? "FÜDA Member"}</h1>
            <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {user?.email ?? "—"}
            </p>
          </div>
        </div>

        {/* Membership card */}
        <Card className={isClubMember ? "border-amber-300" : "border-muted"}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className={isClubMember ? "h-5 w-5 fill-amber-400 text-amber-400" : "h-5 w-5 text-muted-foreground"} />
                  Membership
                </CardTitle>
                <CardDescription>
                  {isClubMember ? "Active FÜDA Club member" : "Not a member yet"}
                </CardDescription>
              </div>
              {isClubMember && (
                <Badge
                  variant="outline"
                  className={
                    isFrozen
                      ? "border-blue-300 text-blue-700"
                      : "border-green-300 text-green-700"
                  }
                >
                  {isFrozen ? (
                    <span className="flex items-center gap-1">
                      <Snowflake className="h-3 w-3" /> Frozen
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Active
                    </span>
                  )}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isClubMember ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Plan</p>
                    <p className="font-semibold">{PLAN_LABELS[planType] ?? planType}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{PLAN_PRICES[planType]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Next billing</p>
                    {sub?.currentPeriodEnd ? (
                      <p className="font-semibold">{formatDate(sub.currentPeriodEnd)}</p>
                    ) : planType === "trial" ? (
                      <>
                        <p className="font-semibold">After trial ends</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Auto-rolls into $180/fortnight, cancel anytime
                        </p>
                      </>
                    ) : (
                      <p className="font-semibold text-muted-foreground">—</p>
                    )}
                    {isFrozen && sub?.frozenUntil && (
                      <p className="text-xs text-blue-600 mt-0.5">Frozen until {formatDate(sub.frozenUntil)}</p>
                    )}
                  </div>
                </div>
                <Separator />
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setLocation("/fuda-club")}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Manage Subscription
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setLocation("/orders")}
                  >
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    My Orders
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Join The FÜDA Club for daily coins + 10% off every order.
                </p>
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => setLocation("/fuda-club")}
                >
                  Join The FÜDA Club
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Coin balance */}
        {isClubMember && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Coins className="h-4 w-4 text-amber-500" />
                FÜDA Coins
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold text-amber-700">{coinBalance}</span>
                <span className="text-sm text-muted-foreground pb-1">
                  available {coinBalance === 1 ? "coin" : "coins"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {coinBalance > 0
                  ? "Use your coin for one free menu item — order before 10:30 AM for delivery."
                  : "New coin issued at 6:00 AM tomorrow (Mon–Sat). Coins are valid for 2 days."}
              </p>
              {totalCoinsIssued > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Total issued
                  </span>
                  <span>
                    {usedCoinsCount} used / {totalCoinsIssued} all-time
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Venue + free-delivery progress */}
        {isClubMember && (
          <Card className={venueStatus?.qualifiesForFreeDelivery ? "border-green-300" : "border-muted"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Workplace</CardTitle>
              <CardDescription className="text-xs">
                When your workplace has 5+ active FÜDA Club members, every delivery from anyone there is free — every day, no exceptions.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              {clubStatus?.venueName ? (
                <>
                  <div>
                    <p className="font-medium">{clubStatus.venueName}</p>
                    {clubStatus.venueAddress && (
                      <p className="text-xs text-muted-foreground">{clubStatus.venueAddress}</p>
                    )}
                  </div>
                  {/* Member-count progress */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">
                        {venueStatus?.memberCount ?? 0} of 5 active members
                      </span>
                      <span className={venueStatus?.qualifiesForFreeDelivery ? "text-green-700 font-semibold" : "text-muted-foreground"}>
                        {venueStatus?.qualifiesForFreeDelivery
                          ? "✓ Free delivery unlocked"
                          : `${venueStatus?.neededForFreeDelivery ?? 5} more for free delivery`}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full transition-all ${venueStatus?.qualifiesForFreeDelivery ? "bg-green-500" : "bg-amber-500"}`}
                        style={{ width: `${Math.min(100, ((venueStatus?.memberCount ?? 0) / 5) * 100)}%` }}
                      />
                    </div>
                  </div>
                  {!venueStatus?.qualifiesForFreeDelivery && referralLink && (
                    <p className="text-xs text-muted-foreground">
                      Share your referral link with colleagues — every signup gets you both 1 FÜDA Coin AND moves your workplace closer to free delivery for everyone.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">No venue set yet — add your workplace to start counting toward free delivery.</p>
              )}
              <Button
                variant="link"
                size="sm"
                className="px-0 mt-1 h-auto"
                onClick={() => setLocation("/fuda-club")}
              >
                {clubStatus?.venueName ? "Edit workplace →" : "Add a workplace →"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Referral */}
        {isClubMember && referralCode && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Referral</CardTitle>
              <CardDescription className="text-xs">
                Share your link — you both get 1 FÜDA Coin when they subscribe
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={referralLink}
                  readOnly
                  className="flex-1 text-xs font-mono bg-muted px-3 py-2 rounded border border-input"
                />
                <Button size="icon" variant="outline" onClick={copyReferral}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your code: <span className="font-mono font-bold">{referralCode}</span>
              </p>
            </CardContent>
          </Card>
        )}

        {/* Account actions */}
        <Card className="border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                <strong>Signed in via Google:</strong> {user?.email ?? "—"}
              </p>
              <p>
                To change your name or photo, update them in your Google account — they'll
                sync next time you log in.
              </p>
            </div>
            <Button
              variant="ghost"
              className="w-full text-destructive hover:text-destructive justify-start"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {logout.isPending ? "Logging out..." : "Log out"}
            </Button>
          </CardContent>
        </Card>

        {/* Order history with reorder buttons */}
        <OrderHistorySection />

        {/* Help footer */}
        <Card className="border-muted bg-muted/40">
          <CardContent className="pt-4 pb-4 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Need help?</p>
                <p>
                  Email{" "}
                  <a href="mailto:info@fuda.com.au" className="underline">
                    info@fuda.com.au
                  </a>{" "}
                  or call <a href="tel:0452831913" className="underline">0452 831 913</a>{" "}
                  (Sun–Thu 10AM–10PM, Fri–Sat 10AM–1AM Darwin time).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// ─── Onboarding nudge — context-aware welcome / trial-ending banner ──────────

function OnboardingNudge() {
  const { data } = trpc.fudaClub.getOnboardingNudge.useQuery();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  if (!data || dismissed.has(data.key)) return null;
  return (
    <Card className="border-2 border-[#C9A84C] bg-gradient-to-br from-amber-50 to-amber-100/50">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="font-black text-base text-[#1A1A1A] mb-1">{data.title}</p>
            <p className="text-sm text-amber-900/80">{data.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(prev => new Set(prev).add(data.key))}
            className="text-amber-900/60 hover:text-amber-900 shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Order history with reorder buttons ──────────────────────────────────────

function OrderHistorySection() {
  const [, setLocation] = useLocation();
  const { data } = trpc.fudaClub.getMyOrderHistory.useQuery({ limit: 10 });
  const utils = trpc.useUtils();

  async function reorder(orderId: number) {
    try {
      const res = await utils.fudaClub.reorder.fetch({ orderId });
      if (!res.items.length) {
        toast.error("None of those items are available anymore.");
        return;
      }
      // Replace the cart with the past order's items, then route to checkout.
      localStorage.setItem("fuda_cart", JSON.stringify(res.items));
      window.dispatchEvent(new Event("cartUpdated"));
      const skippedNote = res.skipped > 0
        ? ` (${res.skipped} item${res.skipped > 1 ? "s" : ""} no longer on menu — skipped)`
        : "";
      toast.success(`Cart loaded${skippedNote}`);
      setLocation("/checkout");
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't reorder");
    }
  }

  if (!data || data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-amber-500" />
          Recent orders
        </CardTitle>
        <CardDescription>One tap to reorder anything you've had before.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.slice(0, 10).map(o => (
          <div key={o.id} className="flex items-center justify-between border-b border-gray-100 last:border-0 py-2 gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">{o.orderNumber}</span>
                <span className="text-xs text-gray-500">
                  {o.orderDate ? new Date(o.orderDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : ""}
                </span>
              </div>
              <p className="text-xs text-gray-600 truncate">
                {o.items.map(it => `${it.quantity}× ${it.itemName}`).join(", ")}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-bold">${((o.total ?? 0) / 100).toFixed(2)}</div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs mt-1 border-amber-400 text-amber-900 hover:bg-amber-50"
                onClick={() => reorder(o.id)}
              >
                Reorder
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
