import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign, Truck, Users, Clock, Star, CheckCircle2, LogOut,
  CreditCard, Coins, Zap, Snowflake, Gift, ChevronRight, Building2, HardHat,
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
              <Button variant="outline" size="sm" onClick={() => setLocation("/subscribe")} className="gap-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                {user?.role === "admin" ? "Subscriptions" : "My Plan"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLocation("/fuda-club")} className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50">
                <Coins className="h-3.5 w-3.5" />
                FÜDA Club
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
      <section className="bg-gradient-to-br from-primary/10 via-background to-amber-50 py-24">
        <div className="container max-w-5xl text-center space-y-6">
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-sm px-4 py-1.5">
            Darwin's Daily Lunch — for every worker
          </Badge>
          <h2 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-tight">
            Eat well.<br />Every single day.
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Whether you're in an office or on a site — FÜDA delivers authentic global street food
            to your door. Choose the plan that fits your life.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button size="lg" className="bg-primary text-primary-foreground px-8" onClick={() => goTo("/subscribe")}>
              Corporate Plan
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-white px-8" onClick={() => goTo("/fuda-club")}>
              <Coins className="mr-2 h-5 w-5" />
              Join The FÜDA Club
            </Button>
          </div>
        </div>
      </section>

      {/* ── Two plans side-by-side ─────────────────────────────── */}
      <section className="py-20 bg-muted/20">
        <div className="container max-w-5xl">
          <h3 className="text-3xl font-bold text-center mb-2">Two ways to FÜDA</h3>
          <p className="text-center text-muted-foreground mb-12">Pick the plan that matches how you work</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Corporate Plan */}
            <Card className="border-primary/30 shadow-md relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
              <CardHeader className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-5 w-5 text-primary" />
                  <Badge variant="outline" className="text-xs border-primary/40 text-primary">For Teams</Badge>
                </div>
                <CardTitle className="text-2xl">Corporate Plan</CardTitle>
                <CardDescription>Your company subscribes — your team eats</CardDescription>
                <div className="pt-2">
                  <span className="text-4xl font-bold">$270</span>
                  <span className="text-muted-foreground text-sm ml-2">/ fortnight</span>
                  <p className="text-xs text-muted-foreground mt-0.5">or $500/month · ~$16.67/day</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "1 free meal daily for each employee",
                  "Free delivery when 5+ teammates order",
                  "Access to Today's Special",
                  "Team order visibility",
                  "Cancel anytime",
                ].map((f) => (
                  <div key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {f}
                  </div>
                ))}
                <Button className="w-full mt-4" onClick={() => goTo("/subscribe")}>
                  {isAuthenticated ? "View Corporate Plans" : "Login to Subscribe"}
                </Button>
              </CardContent>
            </Card>

            {/* FÜDA Club */}
            <Card className="border-amber-300 shadow-md relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400" />
              <div className="absolute top-4 right-4">
                <Badge className="bg-amber-500 text-white text-xs">New</Badge>
              </div>
              <CardHeader className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <HardHat className="h-5 w-5 text-amber-600" />
                  <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">For Everyone</Badge>
                </div>
                <CardTitle className="text-2xl">The FÜDA Club</CardTitle>
                <CardDescription>Solo workers, tradies, freelancers — anyone</CardDescription>
                <div className="pt-2">
                  <span className="text-4xl font-bold">$80</span>
                  <span className="text-muted-foreground text-sm ml-2">first fortnight</span>
                  <p className="text-xs text-muted-foreground mt-0.5">then $180/fortnight · Mon–Sat</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { icon: Coins, text: "1 FÜDA Coin/day = 1 free meal (any item)" },
                  { icon: Zap, text: "10% off all additional items incl. Mix Grill" },
                  { icon: Truck, text: "Free delivery when 5+ orders from your venue" },
                  { icon: Snowflake, text: "Freeze up to 2 weeks — no charge" },
                  { icon: Gift, text: "Refer a friend — you both get 1 FÜDA Coin" },
                  { icon: Star, text: "Monthly streak bonus — zero waste = 1 free coin" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-start gap-2 text-sm">
                    <Icon className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    {text}
                  </div>
                ))}
                <Button className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => goTo("/fuda-club")}>
                  <Coins className="mr-2 h-4 w-4" />
                  {isAuthenticated ? "Join The FÜDA Club" : "Login to Join"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="py-16">
        <div className="container max-w-6xl">
          <h3 className="text-3xl font-bold text-center mb-12">How it works</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Coins, title: "Subscribe", desc: "Pick a plan — corporate or personal. Start from $80." },
              { icon: Clock, title: "Order by 10:30 AM", desc: "Browse the menu and place your order before the cutoff." },
              { icon: Truck, title: "12:30 PM Delivery", desc: "5+ orders from your venue? Free delivery to your door." },
              { icon: Star, title: "Earn & Save", desc: "FÜDA Club members earn coins, bonuses, and 10% off extras." },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="text-center">
                <CardHeader className="items-center">
                  <div className="p-3 rounded-full bg-primary/10 mb-2">
                    <Icon className="h-7 w-7 text-primary" />
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

      {/* ── FÜDA Club CTA banner ───────────────────────────────── */}
      <section className="py-16 bg-amber-50 border-y border-amber-100">
        <div className="container max-w-3xl text-center space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 border border-amber-200 px-4 py-1.5 text-amber-700 text-sm font-medium">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            The FÜDA Club
          </div>
          <h3 className="text-3xl font-bold">Not at a corporate office? No worries.</h3>
          <p className="text-muted-foreground text-lg">
            The FÜDA Club is for every daily worker — tradies, retail staff, healthcare workers,
            freelancers. One coin a day, 10% off everything else, Mon–Sat.
          </p>
          <p className="text-2xl font-bold text-amber-700">$80 first fortnight · then $180/fortnight</p>
          <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-white px-10" onClick={() => goTo("/fuda-club")}>
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
