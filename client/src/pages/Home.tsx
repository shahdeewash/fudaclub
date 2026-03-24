import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Truck, Users, Clock, Star, CheckCircle2, LogOut, CreditCard } from "lucide-react";
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-6 shadow-md">
        <div className="container flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">FÜDA</h1>
            <p className="text-sm opacity-90">Global Street Bites</p>
          </div>
          {isAuthenticated ? (
            <div className="flex gap-3">
              <CartIndicator />
              <Button variant="secondary" onClick={() => setLocation("/menu")}>
                Browse Menu
              </Button>
              <Button variant="outline" onClick={() => setLocation("/orders")}>
                My Orders
              </Button>
              <Button variant="outline" onClick={() => setLocation("/subscribe")} className="gap-2">
                <CreditCard className="h-4 w-4" />
                {user?.role === 'admin' ? 'Subscriptions' : 'My Plan'}
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                className="text-primary-foreground hover:bg-primary-foreground/20"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {logout.isPending ? "Logging out..." : "Logout"}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => window.location.href = getLoginUrl()}>
              Login
            </Button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="container max-w-4xl text-center">
          <h2 className="text-5xl font-bold mb-6">Corporate Lunch Deal</h2>
          <p className="text-xl text-muted-foreground mb-8">
            From $270/fortnight or $500/month — enjoy daily lunch credits with your team
          </p>
          <div className="flex gap-4 justify-center">
            {isAuthenticated ? (
              <Button size="lg" onClick={() => setLocation("/subscribe")}>
                Get Started
              </Button>
            ) : (
              <Button size="lg" onClick={() => window.location.href = getLoginUrl()}>
                Login to Subscribe
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="container max-w-6xl">
          <h3 className="text-3xl font-bold text-center mb-12">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader>
                <DollarSign className="h-10 w-10 text-secondary mb-3" />
                <CardTitle>Daily Free Meal</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Your first meal is free every day (valued at $18). Additional meals at regular price.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Users className="h-10 w-10 text-secondary mb-3" />
                <CardTitle>Team Collaboration</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  See who's ordering from your company and coordinate lunch together.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Truck className="h-10 w-10 text-secondary mb-3" />
                <CardTitle>Free Delivery</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  When 5+ colleagues order, everyone gets free delivery (saves $8 each).
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Clock className="h-10 w-10 text-secondary mb-3" />
                <CardTitle>Easy Ordering</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Order before 10:30 AM for same-day lunch delivery or pickup.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 bg-muted/30">
        <div className="container max-w-4xl">
          <h3 className="text-3xl font-bold text-center mb-4">Simple Pricing</h3>
          <p className="text-center text-muted-foreground mb-12">Choose the plan that suits your team's rhythm</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Fortnightly */}
            <Card className="border-secondary/50">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">$270</CardTitle>
                <CardDescription className="text-base font-medium">per fortnight</CardDescription>
                <p className="text-xs text-muted-foreground">~$19.29 / day</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                  <span className="text-sm">1 free meal daily (worth $18)</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                  <span className="text-sm">Free delivery when 5+ colleagues order</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                  <span className="text-sm">Access to Today's Special</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                  <span className="text-sm">Cancel anytime</span>
                </div>
                <Button
                  className="w-full mt-2"
                  variant="outline"
                  onClick={() => isAuthenticated ? setLocation("/subscribe") : window.location.href = getLoginUrl()}
                >
                  {isAuthenticated ? "Choose Fortnightly" : "Login to Subscribe"}
                </Button>
              </CardContent>
            </Card>

            {/* Monthly */}
            <Card className="border-secondary relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-secondary text-secondary-foreground text-xs font-semibold px-3 py-1 rounded-full">Best Value</span>
              </div>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">$500</CardTitle>
                <CardDescription className="text-base font-medium">per month</CardDescription>
                <p className="text-xs text-muted-foreground">~$16.67 / day · save ~$40/month</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                  <span className="text-sm">1 free meal daily (worth $18)</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                  <span className="text-sm">Free delivery when 5+ colleagues order</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                  <span className="text-sm">Access to Today's Special</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                  <span className="text-sm">Cancel anytime</span>
                </div>
                <Button
                  className="w-full mt-2"
                  onClick={() => isAuthenticated ? setLocation("/subscribe") : window.location.href = getLoginUrl()}
                >
                  {isAuthenticated ? "Choose Monthly" : "Login to Subscribe"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Menu Preview */}
      <section className="py-16">
        <div className="container max-w-6xl">
          <h3 className="text-3xl font-bold text-center mb-4">What's on the Menu</h3>
          <p className="text-center text-muted-foreground mb-12">
            Authentic global street food delivered fresh daily
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="p-0">
                <img
                  src="https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400"
                  alt="Kebabs"
                  className="w-full h-48 object-cover rounded-t-lg"
                />
              </CardHeader>
              <CardContent className="pt-4">
                <CardTitle>Kebabs</CardTitle>
                <CardDescription>
                  Grilled chicken and lamb wraps with fresh vegetables
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-0">
                <img
                  src="https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=400"
                  alt="Momos"
                  className="w-full h-48 object-cover rounded-t-lg"
                />
              </CardHeader>
              <CardContent className="pt-4">
                <CardTitle>Momos</CardTitle>
                <CardDescription>
                  Handcrafted dumplings with chicken or vegetable filling
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-0">
                <img
                  src="https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=400"
                  alt="Bubble Tea"
                  className="w-full h-48 object-cover rounded-t-lg"
                />
              </CardHeader>
              <CardContent className="pt-4">
                <CardTitle>Drinks</CardTitle>
                <CardDescription>
                  Bubble tea, coffee, and refreshing beverages
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary text-primary-foreground py-8">
        <div className="container text-center">
          <p className="text-sm opacity-90">
            © 2026 FÜDA Corporate Lunch. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
