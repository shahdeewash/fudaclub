import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Truck, Clock, Star, CheckCircle2, LogOut,
  CreditCard, Coins, Zap, Snowflake, Gift, ChevronRight, HardHat,
  User as UserIcon,
} from "lucide-react";
import { CartIndicator } from "@/components/CartIndicator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Logged out successfully");
      window.location.href = "/";
    },
  });

  function goTo(path: string) {
    if (isAuthenticated) setLocation(path);
    else window.location.href = getLoginUrl();
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="bg-primary text-primary-foreground py-5 shadow-md sticky top-0 z-40">
        <div className="container flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">FÜDA</h1>
            <p className="text-xs opacity-80">Global Street Bites · Darwin</p>
          </div>
          {isAuthenticated ? (
            <div className="flex gap-2 flex-wrap justify-end">
              <CartIndicator />
              <Button variant="secondary" size="sm" onClick={() => setLocation("/menu")}>Menu</Button>
              <Button variant="outline" size="sm" onClick={() => setLocation("/orders")}>My Orders</Button>
              <Button variant="outline" size="sm" onClick={() => setLocation("/fuda-club")} className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50">
                <Coins className="h-3.5 w-3.5" />
                FÜDA Club
              </Button>
              {user?.role === "admin" && (
                <Button variant="outline" size="sm" onClick={() => setLocation("/subscribe")} className="gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />
                  Subscriptions
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/profile")}
                className="gap-1.5"
                aria-label="My profile"
              >
                <UserIcon className="h-3.5 w-3.5" />
                Profile
              </Button>
              <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}
                className="text-primary-foreground hover:bg-primary-foreground/20">
                <LogOut className="h-4 w-4 mr-1" />
                {logout.isPending ? "…" : "Logout"}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => window.location.href = getLoginUrl()}>Login</Button>
          )}
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-amber-50 via-background to-primary/5 py-28">
        <div className="container max-w-5xl text-center space-y-7">
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-sm px-4 py-1.5">
            Darwin's Daily Lunch — for every worker
          </Badge>
          <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
            Eat well.<br />Every single day.
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Authentic global street food delivered to your workplace. One coin a day covers your lunch —
            tradies, office workers, retail staff, anyone.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-white px-10 text-lg h-14 rounded-xl shadow-lg" onClick={() => goTo("/fuda-club")}>
              <Coins className="mr-2 h-5 w-5" />
              Join The FÜDA Club
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="px-8 h-14 rounded-xl" onClick={() => goTo("/menu")}>
              Browse Menu
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">$80 first week · then $180/fortnight · Mon–Sat</p>
        </div>
      </section>

      {/* ── Plan card ─────────────────────────────────────────── */}
      <section className="py-20 bg-muted/20">
        <div className="container max-w-2xl">
          <h3 className="text-3xl font-bold text-center mb-2">The FÜDA Club</h3>
          <p className="text-center text-muted-foreground mb-10">One plan. Every daily worker. No employer needed.</p>

          <Card className="border-amber-300 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 to-amber-600" />
            <div className="absolute top-5 right-5">
              <Badge className="bg-amber-500 text-white text-xs px-3 py-1">Most Popular</Badge>
            </div>
            <CardHeader className="pt-8 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <HardHat className="h-5 w-5 text-amber-600" />
                <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">For Everyone</Badge>
              </div>
              <CardTitle className="text-3xl">The FÜDA Club</CardTitle>
              <CardDescription className="text-base">Solo workers, tradies, freelancers, office staff — anyone</CardDescription>
              <div className="pt-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-extrabold text-amber-600">$80</span>
                  <span className="text-muted-foreground text-base">first week</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">then $180 every fortnight · Mon–Sat</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pb-8">
              {[
                { icon: Coins, text: "1 FÜDA Coin per day = 1 free meal (any item on the menu)" },
                { icon: Zap, text: "10% off all additional items — including Mix Grill" },
                { icon: Truck, text: "Free delivery when 5+ orders from your venue by 10:30 AM" },
                { icon: Snowflake, text: "Freeze up to 2 weeks — no charge, no hassle" },
                { icon: Gift, text: "Refer a friend — you both get 1 FÜDA Coin" },
                { icon: Star, text: "Order every day this month? Earn a bonus FÜDA Coin" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3 text-sm">
                  <div className="p-1.5 rounded-full bg-amber-100 shrink-0 mt-0.5">
                    <Icon className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  {text}
                </div>
              ))}
              <Button
                className="w-full mt-6 bg-amber-500 hover:bg-amber-600 text-white h-12 text-base rounded-xl shadow-md"
                onClick={() => goTo("/fuda-club")}
              >
                <Coins className="mr-2 h-5 w-5" />
                {isAuthenticated ? "Go to My FÜDA Club" : "Login to Join"}
              </Button>
              <p className="text-center text-xs text-muted-foreground pt-1">Cancel anytime. No lock-in contract.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="py-16">
        <div className="container max-w-5xl">
          <h3 className="text-3xl font-bold text-center mb-12">How it works</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { icon: Coins, title: "Join The Club", desc: "Subscribe to The FÜDA Club. $80 for your first week." },
              { icon: Clock, title: "Order by 10:30 AM", desc: "Browse the menu and place your order before the cutoff." },
              { icon: Truck, title: "12:30 PM Delivery", desc: "5+ orders from your venue? Free delivery to your door." },
              { icon: Star, title: "Earn & Save", desc: "Coins, streak bonuses, referral rewards — every week." },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="text-center">
                <CardHeader className="items-center">
                  <div className="p-3 rounded-full bg-amber-100 mb-2">
                    <Icon className="h-7 w-7 text-amber-600" />
                  </div>
                  <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{desc}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Menu preview ──────────────────────────────────────── */}
      <section className="py-16 bg-muted/20">
        <div className="container max-w-6xl">
          <h3 className="text-3xl font-bold text-center mb-2">What's on the Menu</h3>
          <p className="text-center text-muted-foreground mb-12">Authentic global street food, made fresh daily</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { src: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400", title: "Kebabs", desc: "Grilled chicken and lamb wraps with fresh vegetables" },
              { src: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=400", title: "Momos", desc: "Handcrafted dumplings with chicken or vegetable filling" },
              { src: "https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=400", title: "Drinks", desc: "Bubble tea, coffee, and refreshing beverages" },
            ].map(({ src, title, desc }) => (
              <Card key={title} className="overflow-hidden">
                <img src={src} alt={title} className="w-full h-48 object-cover" />
                <CardContent className="pt-4">
                  <CardTitle className="text-base mb-1">{title}</CardTitle>
                  <CardDescription>{desc}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-center mt-10">
            <Button size="lg" variant="outline" onClick={() => goTo("/menu")}>
              Browse Full Menu
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── Who it's for ──────────────────────────────────────── */}
      <section className="py-16 bg-amber-50 border-y border-amber-100">
        <div className="container max-w-4xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 border border-amber-200 px-4 py-1.5 text-amber-700 text-sm font-medium">
            <HardHat className="h-4 w-4" />
            Built for every daily worker
          </div>
          <h3 className="text-3xl font-bold">Office, site, shop floor — we've got you.</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {["Tradies", "Office Workers", "Retail Staff", "Healthcare Workers", "Freelancers", "Site Crews", "Teachers", "Anyone"].map((role) => (
              <div key={role} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow-sm border border-amber-100 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0" />
                {role}
              </div>
            ))}
          </div>
          <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-white px-10 mt-4" onClick={() => goTo("/fuda-club")}>
            <Coins className="mr-2 h-5 w-5" />
            Join The FÜDA Club
          </Button>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="bg-primary text-primary-foreground py-8">
        <div className="container text-center space-y-1">
          <p className="font-semibold">FÜDA · Global Street Bites · Darwin NT</p>
          <p className="text-sm opacity-80">© 2026 FÜDA. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
