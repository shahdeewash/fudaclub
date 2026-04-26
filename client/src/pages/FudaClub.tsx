import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Coins,
  Star,
  Zap,
  Calendar,
  MapPin,
  Users,
  Gift,
  Snowflake,
  CheckCircle,
  Clock,
  AlertCircle,
  Copy,
  ExternalLink,
  ChevronRight,
  Home,
  UtensilsCrossed,
  PartyPopper,
  User as UserIcon,
} from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function darwinNow() {
  return new Date().toLocaleString("en-AU", { timeZone: "Australia/Darwin" });
}

// ─── Coin badge ───────────────────────────────────────────────────────────────

function CoinBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-sm font-semibold">
      <Coins className="h-4 w-4" />
      {count} FÜDA {count === 1 ? "Coin" : "Coins"}
    </span>
  );
}

// ─── Persistent nav header (used on dashboard + welcome screens) ─────────────

function ClubNav({ coinCount }: { coinCount?: number }) {
  const [, setLocation] = useLocation();
  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-80 transition"
          aria-label="Back to FÜDA home"
        >
          <span className="text-amber-500">FÜDA</span>
          <span className="text-xs text-muted-foreground font-normal hidden sm:inline">
            Club
          </span>
        </button>
        <div className="flex items-center gap-2">
          {typeof coinCount === "number" && (
            <CoinBadge count={coinCount} />
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLocation("/menu")}
            className="gap-1.5"
          >
            <UtensilsCrossed className="h-4 w-4" />
            <span className="hidden sm:inline">Menu</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLocation("/profile")}
            className="gap-1.5"
            aria-label="My profile"
          >
            <UserIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLocation("/")}
            className="gap-1.5"
            aria-label="Back to home"
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

// ─── Post-payment welcome banner (shown when ?success=1) ─────────────────────

function WelcomeBanner({ subscriptionActive }: { subscriptionActive: boolean }) {
  const [, setLocation] = useLocation();
  return (
    <div className="max-w-2xl mx-auto pt-6 px-4">
      <Card className="border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 shadow-md">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-amber-200 flex items-center justify-center">
            <PartyPopper className="h-6 w-6 text-amber-700" />
          </div>
          <CardTitle className="text-2xl">Welcome to The FÜDA Club!</CardTitle>
          <CardDescription className="text-amber-900/80 text-base mt-1">
            {subscriptionActive ? (
              <>Your membership is active. Your first FÜDA Coin is issued at <strong>6:00 AM Darwin time</strong> tomorrow (Mon–Sat).</>
            ) : (
              <>Setting up your membership now — this takes a few seconds. Feel free to browse while we finish up.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            onClick={() => setLocation("/menu")}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-base py-6"
            size="lg"
          >
            <UtensilsCrossed className="mr-2 h-5 w-5" />
            View the Menu
          </Button>
          <Button
            onClick={() => setLocation("/")}
            variant="outline"
            className="flex-1 text-base py-6"
            size="lg"
          >
            <Home className="mr-2 h-5 w-5" />
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Not subscribed — join card ───────────────────────────────────────────────

type JoinPlanType = "trial" | "fortnightly" | "monthly";

const PLAN_TILES: Record<JoinPlanType, {
  label: string;
  price: string;
  perPeriod: string;
  detail: string;
  badge: string | null;
  ctaSubtext: string;
  ongoingNote: string;
}> = {
  trial: {
    label: "7-Day Trial",
    price: "$80",
    perPeriod: "for your first 7 days",
    detail: "Auto-renews at $180/fortnight after. Cancel anytime in your dashboard.",
    badge: "Try It First",
    ctaSubtext: "for your first week",
    ongoingNote: "Then $180 per fortnight, ongoing.",
  },
  fortnightly: {
    label: "Fortnightly",
    price: "$180",
    perPeriod: "every 2 weeks",
    detail: "Billed every 2 weeks from day 1. Roughly $18/working day.",
    badge: null,
    ctaSubtext: "every 2 weeks",
    ongoingNote: "$180 per fortnight, ongoing.",
  },
  monthly: {
    label: "Monthly",
    price: "$350",
    perPeriod: "per month",
    detail: "Billed monthly from day 1. Roughly $14/working day. Best value.",
    badge: "Best Value",
    ctaSubtext: "per month",
    ongoingNote: "$350 every month, ongoing.",
  },
};

function JoinCard() {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState("");
  const [planType, setPlanType] = useState<JoinPlanType>("trial");

  const createCheckout = trpc.fudaClub.subscribe.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        toast.info("Redirecting to checkout…");
        window.open(data.checkoutUrl, "_blank");
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  function handleJoin() {
    if (!user) return;
    createCheckout.mutate({
      origin: window.location.origin,
      referralCode: referralCode.trim() || undefined,
      planType,
    });
  }

  const selected = PLAN_TILES[planType];

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-10 px-4">
      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-4 py-1.5 text-amber-700 text-sm font-medium">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          New — The FÜDA Club
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Eat well. Every day.</h1>
        <p className="text-muted-foreground text-lg">
          One FÜDA Coin daily. 10% off every order. For every daily worker.
        </p>
      </div>

      {/* Plan selector — 3 tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(Object.keys(PLAN_TILES) as JoinPlanType[]).map((key) => {
          const tile = PLAN_TILES[key];
          const isSelected = planType === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPlanType(key)}
              className={`relative text-left rounded-xl border-2 p-4 transition ${
                isSelected
                  ? "border-amber-500 bg-amber-50 shadow-md"
                  : "border-muted bg-background hover:border-amber-200"
              }`}
              aria-pressed={isSelected}
            >
              {tile.badge && (
                <Badge
                  className={`absolute -top-2 -right-2 text-[11px] px-2 py-0.5 ${
                    isSelected
                      ? "bg-amber-500 text-white"
                      : "bg-amber-100 text-amber-700 border border-amber-200"
                  }`}
                >
                  {tile.badge}
                </Badge>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-base font-semibold">{tile.label}</span>
                <span className="text-2xl font-bold">{tile.price}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{tile.perPeriod}</p>
              <p className="text-xs text-muted-foreground mt-2 leading-snug">{tile.detail}</p>
            </button>
          );
        })}
      </div>

      {/* Pricing card */}
      <Card className="border-amber-200 shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">The FÜDA Club</CardTitle>
              <CardDescription>Mon – Sat · No lock-in · Cancel anytime</CardDescription>
            </div>
            <Badge className="bg-amber-500 text-white text-sm px-3 py-1">
              {selected.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-end gap-2">
            <span className="text-5xl font-bold">{selected.price}</span>
            <div className="text-muted-foreground pb-1">
              <div className="text-sm">{selected.ctaSubtext}</div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{selected.ongoingNote}</p>

          <Separator />

          <ul className="space-y-3 text-sm">
            {[
              { icon: Coins, text: "1 FÜDA Coin per day (Mon–Sat) — redeem for any menu item" },
              { icon: Zap, text: "10% off every order — applies to every item, every time" },
              { icon: Calendar, text: "Coin issued at 6:00 AM — order by 10:30 AM for delivery" },
              { icon: Clock, text: "Coins valid for 2 days — life happens, your lunch doesn't expire" },
              { icon: Snowflake, text: "Freeze up to 2 weeks — no billing during freeze" },
              { icon: Gift, text: "Referral bonus — you and your friend each get 1 FÜDA Coin" },
              { icon: Star, text: "Monthly streak bonus — use every coin, earn 1 free" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2">
                <Icon className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <Separator />

          {/* Referral code input */}
          <div className="space-y-1.5">
            <Label htmlFor="referral" className="text-sm">
              Referral code <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="referral"
              placeholder="Enter a friend's code"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              className="uppercase"
            />
          </div>

          <Button
            className="w-full bg-amber-500 hover:bg-amber-600 text-white text-base py-6"
            onClick={handleJoin}
            disabled={createCheckout.isPending || !user}
          >
            {createCheckout.isPending
              ? "Redirecting…"
              : `Join The FÜDA Club — ${selected.price}`}
            <ChevronRight className="ml-2 h-5 w-5" />
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Mix Grill is excluded from coin redemption but still gets 10% off as a Club member. Coins are valid for 2 days, then expire.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Subscribed — dashboard ───────────────────────────────────────────────────

function ClubDashboard() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: status, isLoading } = trpc.fudaClub.getStatus.useQuery();
  const { data: coinHistory } = trpc.fudaClub.getCoinHistory.useQuery();
  const { data: upcomingClosures } = trpc.fudaClub.getUpcomingClosures.useQuery();

  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [showVenueEdit, setShowVenueEdit] = useState(false);

  const updateVenue = trpc.fudaClub.updateVenue.useMutation({
    onSuccess: () => {
      toast.success("Venue updated");
      setShowVenueEdit(false);
      utils.fudaClub.getStatus.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const freeze = trpc.fudaClub.freezeSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription frozen for 2 weeks");
      utils.fudaClub.getStatus.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const FREEZE_DAYS = 14;

  const unfreeze = trpc.fudaClub.unfreezeSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription reactivated");
      utils.fudaClub.getStatus.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const cancelSub = trpc.fudaClub.cancelSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription cancelled");
      utils.fudaClub.getStatus.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Referral link
  const referralLink = useMemo(() => {
    if (!(user as any)?.referralCode) return "";
    return `${window.location.origin}/fuda-club?ref=${(user as any).referralCode}`;
  }, [user?.referralCode]);

  function copyReferral() {
    navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied!");
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const sub = status?.subscription;
  const availableCoins = status?.coinBalance ?? 0;
  const isFrozen = sub?.status === "frozen";

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
            The FÜDA Club
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isFrozen ? (
              <span className="text-blue-600 font-medium flex items-center gap-1">
                <Snowflake className="h-4 w-4" /> Frozen until{" "}
                {sub?.frozenUntil
                  ? new Date(sub.frozenUntil).toLocaleDateString("en-AU", { timeZone: "Australia/Darwin" })
                  : "—"}
              </span>
            ) : (
              <span className="text-green-600 font-medium flex items-center gap-1">
                <CheckCircle className="h-4 w-4" /> Active
              </span>
            )}
          </p>
        </div>
        <CoinBadge count={availableCoins} />
      </div>

      {/* Upcoming closure notice */}
      {upcomingClosures && upcomingClosures.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-blue-100 shrink-0">
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-sm text-blue-800">Upcoming FÜDA Closures</p>
                <p className="text-xs text-blue-600 mt-0.5">Your coins will roll over on these days.</p>
                <ul className="mt-2 space-y-0.5">
                  {upcomingClosures.map(c => (
                    <li key={c.id} className="text-xs text-blue-700">
                      {new Date(c.closureDate).toLocaleDateString("en-AU", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                      {c.reason ? ` — ${c.reason}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's coin status */}
      <Card className={availableCoins > 0 ? "border-amber-300 bg-amber-50" : "border-muted"}>
        <CardContent className="pt-4 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${availableCoins > 0 ? "bg-amber-200" : "bg-muted"}`}>
              <Coins className={`h-5 w-5 ${availableCoins > 0 ? "text-amber-700" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="font-medium text-sm">
                {availableCoins > 0 ? "FÜDA Coin ready to use!" : "No coins available today"}
              </p>
              <p className="text-xs text-muted-foreground">
                {availableCoins > 0
                  ? "Order by 10:30 AM for 12:30 PM delivery"
                  : "New coin issued at 6:00 AM tomorrow (Mon–Sat)"}
              </p>
            </div>
          </div>
          {availableCoins > 0 && (
            <Button size="sm" variant="default" className="bg-amber-500 hover:bg-amber-600 text-white" asChild>
              <a href="/menu">Order now</a>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Venue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            My Workplace Venue
          </CardTitle>
          <CardDescription className="text-xs">
            Register your venue so 5+ orders from the same location unlock free delivery
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!showVenueEdit ? (
            <div className="flex items-center justify-between">
              <div>
                {status?.venueName ? (
                  <>
                    <p className="font-medium text-sm">{status.venueName}</p>
                    {status.venueAddress && (
                      <p className="text-xs text-muted-foreground">{status.venueAddress}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No venue set</p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setVenueName(status?.venueName ?? "");
                  setVenueAddress(status?.venueAddress ?? "");
                  setShowVenueEdit(true);
                }}
              >
                {status?.venueName ? "Edit" : "Add venue"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Venue name</Label>
                <Input
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder="e.g. Darwin City Council"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Address (optional)</Label>
                <Input
                  value={venueAddress}
                  onChange={(e) => setVenueAddress(e.target.value)}
                  placeholder="e.g. 99 Mitchell St, Darwin"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => updateVenue.mutate({ venueName, venueAddress })}
                  disabled={updateVenue.isPending || !venueName.trim()}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowVenueEdit(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Referral */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Refer a Friend
          </CardTitle>
          <CardDescription className="text-xs">
            Share your link — you both get 1 FÜDA Coin when they subscribe
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(user as any)?.referralCode ? (
            <>
              <div className="flex items-center gap-2">
                <Input
                  value={referralLink}
                  readOnly
                  className="text-xs font-mono bg-muted"
                />
                <Button size="icon" variant="outline" onClick={copyReferral}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your code: <span className="font-mono font-bold">{(user as any).referralCode}</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Referral code not yet generated.</p>
          )}
        </CardContent>
      </Card>

      {/* Coin history */}
      {coinHistory && coinHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Coin History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {coinHistory.slice(0, 20).map((coin: any) => (
                <div key={coin.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Coins className={`h-4 w-4 ${coin.isUsed ? "text-muted-foreground" : "text-amber-500"}`} />
                    <span className="capitalize">{coin.reason.replace("_", " ")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {coin.isUsed ? (
                      <Badge variant="secondary" className="text-xs">Used</Badge>
                    ) : new Date(coin.expiresAt) < new Date() ? (
                      <Badge variant="outline" className="text-xs text-red-500">Expired</Badge>
                    ) : (
                      <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">Available</Badge>
                    )}
                    <span>{new Date(coin.issuedAt).toLocaleDateString("en-AU", { timeZone: "Australia/Darwin" })}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscription management */}
      <Card className="border-muted">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Subscription</CardTitle>
          <CardDescription className="text-xs">
            Next billing:{" "}
            {sub?.currentPeriodEnd ? (
              new Date(sub.currentPeriodEnd).toLocaleDateString("en-AU", { timeZone: "Australia/Darwin" })
            ) : (sub as any)?.planType === "trial" ? (
              <span>after trial ends — auto-rolls into $180/fortnight</span>
            ) : (
              "—"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isFrozen ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => unfreeze.mutate()}
              disabled={unfreeze.isPending}
            >
              <Snowflake className="mr-2 h-4 w-4" />
              {unfreeze.isPending ? "Reactivating…" : "Unfreeze subscription"}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => freeze.mutate({ days: FREEZE_DAYS })}
              disabled={freeze.isPending}
            >
              <Snowflake className="mr-2 h-4 w-4" />
              {freeze.isPending ? "Freezing…" : "Freeze for 2 weeks"}
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm("Are you sure you want to cancel your FÜDA Club subscription?")) {
                cancelSub.mutate();
              }
            }}
            disabled={cancelSub.isPending}
          >
            {cancelSub.isPending ? "Cancelling…" : "Cancel subscription"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FudaClub() {
  const { user, isAuthenticated } = useAuth();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const showSuccess = params.get("success") === "1";
  const showCanceled = params.get("canceled") === "1";

  const { data: status, isLoading: statusLoading } = trpc.fudaClub.getStatus.useQuery(undefined, {
    enabled: !!user,
    // Poll every 2s for the first ~30s after a successful checkout so we pick
    // up the webhook-driven subscription activation without a manual refresh.
    refetchInterval: showSuccess ? 2000 : false,
  });

  if (!isAuthenticated || statusLoading) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const isSubscribed = status?.subscription && status.subscription.status !== "canceled";
  const coinCount = status?.coinBalance ?? 0;

  return (
    <div className="min-h-screen">
      <ClubNav coinCount={isSubscribed ? coinCount : undefined} />

      {/* Cancelled-from-checkout notice (rare, but possible) */}
      {showCanceled && !isSubscribed && (
        <div className="max-w-2xl mx-auto pt-6 px-4">
          <Card className="border-muted bg-muted/40">
            <CardContent className="py-4 text-sm text-muted-foreground text-center">
              Checkout was cancelled — no charge was made. You can pick a plan again below.
            </CardContent>
          </Card>
        </div>
      )}

      {/* Post-payment welcome banner */}
      {showSuccess && (
        <WelcomeBanner subscriptionActive={!!isSubscribed} />
      )}

      {isSubscribed ? <ClubDashboard /> : <JoinCard />}
    </div>
  );
}
