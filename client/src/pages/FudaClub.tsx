import { useState, useMemo, useEffect, useRef } from "react";
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
import { getLoginUrl } from "@/const";
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
  const { isAuthenticated } = useAuth();
  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-80 transition"
          aria-label="Back to FÜDA home"
        >
          <span className="text-[#C9A84C]">FÜDA</span>
          <span className="text-xs text-muted-foreground font-normal hidden sm:inline">
            Club
          </span>
        </button>
        <div className="flex items-center gap-2">
          {typeof coinCount === "number" && (
            <CoinBadge count={coinCount} />
          )}
          {isAuthenticated ? (
            <>
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
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { window.location.href = getLoginUrl(); }}
              className="gap-1.5 border-[#C9A84C] text-[#1A1A1A] hover:bg-[#C9A84C]/10"
            >
              Sign in
            </Button>
          )}
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

// ─── New homepage / JoinCard — visually attractive landing page ──────────────

function JoinCard() {
  const { user, isAuthenticated } = useAuth();
  const [referralCode, setReferralCode] = useState("");
  // Default to "trial" since it's the entry-level option new visitors gravitate to.
  // Persisted to localStorage so the user's pick survives the Google-OAuth round-trip
  // (otherwise: pick Trial → click "Sign in to join" → bounce through OAuth → land
  // back on /fuda-club with state reset → click Join → mutation fires with the
  // default plan, NOT the trial they originally picked).
  const [planType, setPlanType] = useState<JoinPlanType>(() => {
    if (typeof window === "undefined") return "trial";
    const saved = window.localStorage.getItem("fuda_join_plan");
    if (saved === "trial" || saved === "fortnightly" || saved === "monthly") return saved;
    return "trial";
  });
  // Persist on every change so an OAuth bounce in the middle of selection doesn't lose it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("fuda_join_plan", planType);
  }, [planType]);

  const { data: founding } = trpc.fudaClub.getFoundingProgress.useQuery(undefined, {
    refetchInterval: 30 * 1000,
  });

  const createCheckout = trpc.fudaClub.subscribe.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        // Now that we're sending the user to Stripe Checkout, we can let go of
        // the persisted plan choice — they've committed and the server-side
        // mutation already used the right planType. Prevents stale carry-over
        // for the next signup on the same device.
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("fuda_join_plan");
        }
        toast.info("Redirecting to checkout…");
        window.open(data.checkoutUrl, "_blank");
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  function handleJoin() {
    // Unauthenticated visitor clicking Join → kick them through Google OAuth login
    // first; after login the app brings them back to /fuda-club where they can
    // complete checkout with one more click.
    if (!isAuthenticated || !user) {
      window.location.href = getLoginUrl();
      return;
    }
    createCheckout.mutate({
      origin: window.location.origin,
      referralCode: referralCode.trim() || undefined,
      planType,
    });
  }

  // Plan pricing — current (founder) and post-launch (+20%)
  const PLANS = [
    {
      key: "trial" as const,
      label: "7-Day Trial",
      tagline: "Try the club",
      currentPrice: 80,
      postLaunchPrice: 96,
      period: "for 7 days",
      sub: "Then auto-rolls into fortnightly",
      badge: null as string | null,
      highlight: false,
    },
    {
      key: "fortnightly" as const,
      label: "Fortnightly",
      tagline: "Most flexible",
      currentPrice: 180,
      postLaunchPrice: 216,
      period: "every 2 weeks",
      sub: "≈ $18 / working day",
      badge: "MOST POPULAR",
      highlight: true,
    },
    {
      key: "monthly" as const,
      label: "Monthly",
      tagline: "Best value",
      currentPrice: 350,
      postLaunchPrice: 420,
      period: "per month",
      sub: "≈ $14 / working day",
      badge: "SAVE MORE",
      highlight: false,
    },
  ];

  const selected = PLANS.find(p => p.key === planType)!;

  // Sticky bottom CTA bar — appears once the hero scrolls out of view so the
  // join action is always one tap away. IntersectionObserver beats scroll-listener
  // (no manual throttling, no layout reads).
  const heroRef = useRef<HTMLElement | null>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  useEffect(() => {
    if (!heroRef.current) return;
    const el = heroRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-80px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="bg-white">
      {/* ── HERO — big, immersive, food-warmth radial gradient ────────────── */}
      <section
        ref={heroRef}
        className="relative overflow-hidden text-white text-center px-4 pt-20 pb-24 sm:pt-28 sm:pb-32"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 30% 30%, rgba(201,168,76,0.35), transparent 60%)," +
            "radial-gradient(ellipse 60% 50% at 80% 80%, rgba(230,57,70,0.22), transparent 60%)," +
            "radial-gradient(circle at 50% 100%, rgba(201,168,76,0.15), transparent 50%)," +
            "linear-gradient(160deg, #0F0F0F 0%, #1A1A1A 50%, #2a2218 100%)",
        }}
      >
        {/* Soft noise + subtle decorative shapes */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-soft-light"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
          }}
        />
        {/* Decorative circle accents — subtle gold orbs */}
        <div aria-hidden className="absolute top-10 left-[8%] w-32 h-32 rounded-full bg-[#C9A84C]/10 blur-3xl" />
        <div aria-hidden className="absolute bottom-10 right-[8%] w-40 h-40 rounded-full bg-[#E63946]/10 blur-3xl" />

        <div className="relative max-w-4xl mx-auto">
          {/* Founding-50 badge — much bigger, glowing */}
          {founding?.isFoundingWindowOpen && (
            <div className="inline-flex items-center gap-2.5 rounded-full bg-[#E63946]/15 border-2 border-[#E63946]/50 px-5 py-2 text-[#ff7a82] text-sm font-bold tracking-wider uppercase mb-8 shadow-[0_0_40px_rgba(230,57,70,0.3)]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E63946] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#E63946]" />
              </span>
              Founding {founding.remaining} of {founding.cap} spots left
            </div>
          )}
          <h1 className="text-7xl sm:text-9xl font-black leading-[0.9] tracking-tighter mb-6">
            Lunch,<br/>
            <span className="text-[#C9A84C]" style={{ textShadow: "0 4px 30px rgba(201,168,76,0.4)" }}>sorted.</span>
          </h1>
          <p className="text-xl sm:text-2xl text-white/80 max-w-2xl mx-auto leading-relaxed font-light">
            Darwin's lunch subscription. Save <strong className="text-[#C9A84C] font-bold">10%</strong> on everything,<br className="hidden sm:block"/>
            get up to <strong className="text-[#C9A84C] font-bold">6 free lunches</strong> a week.
          </p>
          {/* Big inline CTA buttons in the hero itself */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              className="bg-[#C9A84C] hover:bg-[#b89540] text-[#1A1A1A] text-lg py-7 px-10 font-black tracking-wide shadow-[0_8px_30px_rgba(201,168,76,0.4)]"
              onClick={handleJoin}
              disabled={createCheckout.isPending}
            >
              {isAuthenticated ? `Join from $80` : `Sign in & join from $80`}
              <ChevronRight className="ml-2 h-6 w-6" />
            </Button>
            <button
              type="button"
              onClick={() => document.getElementById("plans")?.scrollIntoView({ behavior: "smooth" })}
              className="text-white/70 hover:text-white text-sm font-semibold uppercase tracking-wider underline-offset-4 hover:underline px-4 py-2"
            >
              See plans ↓
            </button>
          </div>
          {/* Hero stats strip */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mt-12 text-sm text-white/70 uppercase tracking-wider font-bold">
            <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-[#C9A84C]" /> 100% Halal</span>
            <span className="opacity-30">·</span>
            <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-[#C9A84C]" /> Cancel anytime</span>
            <span className="opacity-30">·</span>
            <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-[#C9A84C]" /> Pickup &amp; delivery</span>
          </div>
        </div>
      </section>

      {/* ── PLAN SELECTOR — bigger type, generous internal padding ─────────── */}
      <section id="plans" className="px-4 py-20 sm:py-28 bg-gradient-to-b from-white to-[#FAF7F0]/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-sm uppercase tracking-[0.3em] text-[#C9A84C] font-black mb-3">— Pick your plan —</div>
            <h2 className="text-5xl sm:text-6xl font-black text-[#1A1A1A] tracking-tight leading-none">
              Three ways<br/>to <span className="text-[#C9A84C]">join.</span>
            </h2>
            <p className="text-lg text-gray-600 mt-5 max-w-xl mx-auto">
              All plans include 10% off everything, free workplace delivery, and FÜDA Coins.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {PLANS.map(plan => {
              const isSelected = planType === plan.key;
              return (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => setPlanType(plan.key)}
                  className={`relative text-left rounded-3xl p-8 sm:p-10 transition-colors duration-150 border-2 ${
                    isSelected
                      ? "bg-[#1A1A1A] text-white border-[#C9A84C] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
                      : plan.highlight
                        ? "bg-white border-[#C9A84C] hover:shadow-2xl shadow-lg"
                        : "bg-white border-gray-200 hover:border-[#C9A84C]/60 hover:shadow-xl shadow-md"
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <div className="bg-[#E63946] text-white text-xs font-black tracking-widest uppercase px-4 py-1.5 rounded-full whitespace-nowrap shadow-lg">
                        {plan.badge}
                      </div>
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute top-5 right-5 h-9 w-9 rounded-full bg-[#C9A84C] flex items-center justify-center shadow-lg">
                      <CheckCircle className="h-5 w-5 text-[#1A1A1A]" />
                    </div>
                  )}
                  <div className="text-sm uppercase tracking-[0.2em] text-[#C9A84C] font-black mb-4">
                    {plan.label}
                  </div>
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-7xl font-black leading-none tracking-tighter">${plan.currentPrice}</span>
                  </div>
                  {founding?.isFoundingWindowOpen && (
                    <div className="flex items-baseline gap-2 mb-4">
                      <span className={`text-base line-through ${isSelected ? "text-white/40" : "text-gray-400"}`}>
                        ${plan.postLaunchPrice}
                      </span>
                      <span className="text-xs font-bold text-[#E63946] uppercase tracking-wide">post-launch</span>
                    </div>
                  )}
                  <div className={`text-base mb-6 ${isSelected ? "text-white/70" : "text-gray-600"}`}>
                    <strong>{plan.period}</strong>
                    <br/>
                    <span className="text-sm opacity-80">{plan.sub}</span>
                  </div>
                  <div className={`text-base font-bold mb-1 ${isSelected ? "text-[#C9A84C]" : "text-[#1A1A1A]"}`}>
                    {plan.tagline}
                  </div>
                  {founding?.isFoundingWindowOpen && (
                    <div className={`mt-6 pt-5 border-t text-xs ${
                      isSelected ? "border-white/15 text-[#C9A84C]" : "border-gray-100 text-[#E63946]"
                    } font-black uppercase tracking-widest flex items-center gap-2`}>
                      🔒 Price locked 12 months
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Referral + CTA */}
          <div className="max-w-lg mx-auto mt-12 space-y-4">
            <div>
              <Label htmlFor="referral" className="text-sm font-bold text-[#1A1A1A] mb-2 block">
                Referral code <span className="text-gray-500 font-normal">(optional)</span>
              </Label>
              <Input
                id="referral"
                placeholder="Enter a friend's code"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                className="uppercase border-2 focus:border-[#C9A84C] h-14 text-base"
              />
            </div>
            <Button
              className="w-full bg-[#C9A84C] hover:bg-[#b89540] text-[#1A1A1A] text-lg py-8 font-black tracking-wide shadow-[0_8px_30px_rgba(201,168,76,0.4)]"
              onClick={handleJoin}
              disabled={createCheckout.isPending}
            >
              {createCheckout.isPending
                ? "Redirecting…"
                : isAuthenticated
                  ? `Join — $${selected.currentPrice} ${selected.period}`
                  : `Sign in to join — $${selected.currentPrice} ${selected.period}`}
              <ChevronRight className="ml-2 h-6 w-6" />
            </Button>
            <p className="text-sm text-center text-gray-500">
              Cancel anytime · No lock-in · Secure payment via Stripe
            </p>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF STRIP — bigger numbers, more presence ─────────────── */}
      {founding && (
        <section className="bg-[#1A1A1A] text-white px-4 py-14 sm:py-16">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <div className="text-sm uppercase tracking-[0.3em] text-[#C9A84C] font-black mb-2">— By the numbers —</div>
            </div>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-5xl sm:text-7xl font-black text-[#C9A84C] tracking-tighter">{founding.taken}</div>
                <div className="text-xs sm:text-sm uppercase tracking-widest text-white/60 font-bold mt-3">Founding members joined</div>
              </div>
              <div className="border-l border-r border-white/10">
                <div className="text-5xl sm:text-7xl font-black text-[#C9A84C] tracking-tighter">10%</div>
                <div className="text-xs sm:text-sm uppercase tracking-widest text-white/60 font-bold mt-3">Off every order</div>
              </div>
              <div>
                <div className="text-5xl sm:text-7xl font-black text-[#C9A84C] tracking-tighter">6×</div>
                <div className="text-xs sm:text-sm uppercase tracking-widest text-white/60 font-bold mt-3">Free lunches a week</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── PERKS GRID — bigger cards, generous padding, real presence ─────── */}
      <section className="px-4 py-20 sm:py-28">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-sm uppercase tracking-[0.3em] text-[#C9A84C] font-black mb-3">— Members get —</div>
            <h2 className="text-5xl sm:text-6xl font-black text-[#1A1A1A] tracking-tight leading-none">
              Every perk.<br/><span className="text-[#C9A84C]">Every time.</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {[
              { icon: Zap, title: "10% off everything", body: "Every item, every time. Auto-applied at checkout. No codes, no fuss." },
              { icon: Coins, title: "6 free lunches a week", body: "1 FÜDA Coin per day Mon–Sat. Each covers your highest-value item. All reset Monday." },
              { icon: Users, title: "Free workplace delivery", body: "5+ members at your office? We deliver lunch to your work — no fee, ever." },
              { icon: Snowflake, title: "Freeze anytime", body: "Going on holiday? Pause for up to 2 weeks. Zero billing during freeze." },
              { icon: CheckCircle, title: "100% halal certified", body: "Every plate, every time. No exceptions, no compromises." },
              { icon: Gift, title: "Refer a friend", body: "You both get a free FÜDA Coin when they join. No limit on how many you can refer." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white rounded-2xl p-8 border-2 border-gray-100 hover:border-[#C9A84C] hover:shadow-2xl transition-all">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#C9A84C] to-[#a88a3c] flex items-center justify-center mb-5 shadow-lg">
                  <Icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="font-black text-[#1A1A1A] text-xl mb-2 tracking-tight">{title}</h3>
                <p className="text-base text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS — bigger numbered cards on warm background ────────── */}
      <section className="px-4 py-20 sm:py-28 bg-gradient-to-br from-[#FAF7F0] to-[#F5EFE0]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-sm uppercase tracking-[0.3em] text-[#C9A84C] font-black mb-3">— How it works —</div>
            <h2 className="text-5xl sm:text-6xl font-black text-[#1A1A1A] tracking-tight leading-none">
              Three steps.
            </h2>
            <p className="text-lg text-gray-600 mt-5">From signup to your first lunch — under 2 minutes.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {[
              { n: "01", title: "Pick a plan", body: "Trial, fortnightly, or monthly. Cancel anytime — no contracts, no lock-in." },
              { n: "02", title: "Eat with us", body: "Pickup from 9 Searcy St, or get free workplace delivery (5+ members at your office)." },
              { n: "03", title: "Save every time", body: "10% off auto-applies at checkout. Coins land on your highest-value item — max value, every order." },
            ].map(step => (
              <div key={step.n} className="bg-white rounded-3xl p-8 sm:p-10 shadow-lg hover:shadow-2xl transition border border-white">
                <div className="text-6xl font-black text-[#C9A84C] mb-4 tracking-tighter leading-none">{step.n}</div>
                <h3 className="text-2xl font-black text-[#1A1A1A] mb-3 tracking-tight">{step.title}</h3>
                <p className="text-base text-gray-600 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RULES & FINE PRINT — bigger header, more presence ──────────────── */}
      <section className="px-4 py-20 sm:py-28">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-sm uppercase tracking-[0.3em] text-[#C9A84C] font-black mb-3">— The rules —</div>
            <h2 className="text-5xl sm:text-6xl font-black text-[#1A1A1A] tracking-tight leading-none">
              No surprises.
            </h2>
            <p className="text-lg text-gray-600 mt-5">Everything you should know — in plain English.</p>
          </div>
          <div className="bg-white rounded-3xl border-2 border-gray-100 divide-y-2 divide-gray-100 shadow-lg overflow-hidden">
            {[
              { q: "What does the 10% discount apply to?", a: "Every item on the menu — momos, kebabs, bubble tea, coffee, sides, even Mix Grill. Auto-applied at checkout once you're logged in as a member." },
              { q: "How do FÜDA Coins work?", a: "1 coin is issued each day Mon–Sat (none on Sunday). Each coin covers ONE item — free. When you check out we automatically apply your coin to the highest-value item in your cart so you get the most for it. You choose how many coins to spend on each order (so you can save some for later)." },
              { q: "Do coins expire? When do they reset?", a: "All your coins expire at the same time — midnight Sunday Darwin time. So a Monday coin lasts the full week (7 days), a Saturday coin lasts 2 days. Every Monday morning is a clean slate with up to 6 fresh coins coming through the week. Forgiving by design — sick on Tuesday? You still have 5 chances that week." },
              { q: "Can I use a coin on Mix Grill?", a: "No — Mix Grill items are excluded from coin redemption (they always still get the 10% member discount). Coins are only valid on other menu items. If your cart is Mix Grill-only, your coins stay in your balance for next time." },
              { q: "How does free delivery work?", a: "Within 5km of 9 Searcy St. Free if 5+ members from your workplace are subscribed; otherwise $10 flat. $15 minimum order on delivery. Pickup is always free." },
              { q: "What happens after the trial?", a: "The 7-day trial auto-rolls into the fortnightly plan ($180/fortnight) unless you cancel before the trial ends. You can cancel from your Profile in two clicks." },
              { q: "Can I freeze my subscription?", a: "Yes — pause for up to 2 weeks at a time. No billing during freeze. Use it for holidays, sick weeks, or when you're out of town." },
              { q: "Can I cancel anytime? What happens to my coins?", a: "Yes — no contracts, no lock-in, no questions asked. Cancel from your Profile or message us. The 10% member discount stops immediately, but you keep the right to spend any FÜDA Coins you've already earned until the end of the period you've paid for. After that window closes, all access ends. You won't be charged again." },
              { q: "What if I don't eat with you for a few days?", a: "The membership IS the value, not a daily lunch obligation. Use the 10% off and Coins whenever you want. There's no penalty for not ordering." },
              { q: "Is the food halal?", a: "Yes — 100% halal certified. Every plate. No exceptions." },
              { q: "How does founding-member pricing work?", a: `First ${founding?.cap ?? 50} members keep today's pricing for 12 months. After spot ${founding?.cap ?? 50}, new members pay 20% more. After year one, founders get a 5% loyalty discount on whatever the prevailing rate is.` },
            ].map((item, i) => (
              <details key={i} className="group">
                <summary className="cursor-pointer p-6 sm:p-7 list-none flex items-start justify-between gap-4 hover:bg-[#FAF7F0]/40 transition">
                  <span className="font-bold text-[#1A1A1A] text-base sm:text-lg">{item.q}</span>
                  <ChevronRight className="h-6 w-6 text-[#C9A84C] shrink-0 transition-transform group-open:rotate-90 mt-0.5" />
                </summary>
                <div className="px-6 sm:px-7 pb-6 sm:pb-7 -mt-1 text-base text-gray-600 leading-relaxed">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA — bold, dark, big closing statement ───────────────────── */}
      <section
        className="relative overflow-hidden text-white px-4 py-24 sm:py-32 text-center"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(201,168,76,0.25), transparent 60%)," +
            "linear-gradient(180deg, #1A1A1A 0%, #0F0F0F 100%)",
        }}
      >
        <div className="relative max-w-3xl mx-auto">
          {founding?.isFoundingWindowOpen && (
            <div className="inline-flex items-center gap-2.5 rounded-full bg-[#E63946]/20 border-2 border-[#E63946]/50 px-5 py-2 text-[#ff7a82] text-sm font-bold tracking-wider uppercase mb-8 shadow-[0_0_30px_rgba(230,57,70,0.3)]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E63946] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#E63946]" />
              </span>
              {founding.remaining} founding spots left
            </div>
          )}
          <h2 className="text-5xl sm:text-7xl font-black leading-[0.95] tracking-tight mb-6">
            Ready to <span className="text-[#C9A84C]" style={{ textShadow: "0 4px 30px rgba(201,168,76,0.4)" }}>eat well</span><br/>without thinking?
          </h2>
          <p className="text-lg sm:text-xl text-white/75 mb-10 max-w-xl mx-auto">
            Join the FÜDA Club today. Cancel anytime — no contracts, no lock-in.
          </p>
          <Button
            className="bg-[#C9A84C] hover:bg-[#b89540] text-[#1A1A1A] text-lg py-8 px-12 font-black tracking-wide shadow-[0_8px_40px_rgba(201,168,76,0.5)]"
            onClick={handleJoin}
            disabled={createCheckout.isPending}
          >
            {createCheckout.isPending
              ? "Redirecting…"
              : isAuthenticated
                ? `Join — $${selected.currentPrice}`
                : `Sign in to join — $${selected.currentPrice}`}
            <ChevronRight className="ml-2 h-6 w-6" />
          </Button>
          <div className="text-sm text-white/50 mt-10 flex items-center justify-center gap-3 flex-wrap font-medium">
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> 9 Searcy St, Darwin City</span>
            <span className="opacity-30">·</span>
            <span>Sun–Thu 10am–10pm</span>
            <span className="opacity-30">·</span>
            <span>Fri–Sat 10am–1am</span>
          </div>
        </div>
      </section>

      {/* ── STICKY BOTTOM CTA — appears once hero scrolls out of view ───────── */}
      <div
        className={`fixed bottom-0 inset-x-0 z-40 bg-[#1A1A1A] border-t-2 border-[#C9A84C] shadow-[0_-4px_20px_rgba(0,0,0,0.2)] transition-transform duration-300 ${
          stickyVisible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-white text-xs sm:text-sm min-w-0">
            <div className="font-bold text-[#C9A84C] truncate">
              {founding?.isFoundingWindowOpen
                ? `${founding.remaining} founding spots left`
                : "Join The FÜDA Club"}
            </div>
            <div className="text-white/60 text-[11px] hidden sm:block">
              From ${selected.currentPrice} {selected.period}
            </div>
          </div>
          <Button
            className="bg-[#C9A84C] hover:bg-[#b89540] text-[#1A1A1A] font-bold text-sm py-5 px-5 shrink-0"
            onClick={handleJoin}
            disabled={createCheckout.isPending}
          >
            {createCheckout.isPending
              ? "…"
              : isAuthenticated
                ? `Join — $${selected.currentPrice}`
                : `Sign in — $${selected.currentPrice}`}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
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
              if (confirm(
                "Cancel your FÜDA Club subscription?\n\n" +
                "• 10% member discount STOPS immediately on new orders.\n" +
                "• You can still spend any FÜDA Coins you've earned, until the end of your current paid period.\n" +
                "• You will NOT be charged again.\n" +
                "• No refund for unused days.\n" +
                "• You can rejoin anytime.\n\n" +
                "Click OK to confirm."
              )) {
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

  // Unauthenticated visitors land here from fudaclub.com.au — show the marketing
  // landing page (JoinCard) immediately. The Join button itself handles the
  // redirect-to-login flow when clicked. Only show the loading skeleton if we're
  // authenticated and waiting on status data.
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen">
        <ClubNav />
        <JoinCard />
      </div>
    );
  }

  if (statusLoading) {
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
