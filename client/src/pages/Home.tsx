import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Truck, Users, Clock, Star, CheckCircle2 } from "lucide-react";
import { getLoginUrl } from "@/const";

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

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
              <Button variant="secondary" onClick={() => setLocation("/menu")}>
                Browse Menu
              </Button>
              {user?.role === "admin" && (
                <Button variant="outline" onClick={() => setLocation("/admin")}>
                  Admin
                </Button>
              )}
              {(user?.role === "admin" || user?.role === "kitchen") && (
                <Button variant="outline" onClick={() => setLocation("/kitchen")}>
                  Kitchen
                </Button>
              )}
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
            Subscribe for $25/fortnight and enjoy daily lunch credits with your team
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
          <h3 className="text-3xl font-bold text-center mb-12">Simple Pricing</h3>
          <Card className="max-w-md mx-auto border-secondary">
            <CardHeader className="text-center">
              <Star className="h-12 w-12 text-secondary mx-auto mb-4 fill-secondary" />
              <CardTitle className="text-3xl">$25 / fortnight</CardTitle>
              <CardDescription className="text-lg">Corporate Lunch Subscription</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-secondary mt-0.5" />
                  <span>1 free meal daily (worth $18)</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-secondary mt-0.5" />
                  <span>Free delivery when 5+ colleagues order</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-secondary mt-0.5" />
                  <span>Access to Today's Special</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-secondary mt-0.5" />
                  <span>See colleague orders in real-time</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-secondary mt-0.5" />
                  <span>Cancel anytime</span>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => isAuthenticated ? setLocation("/subscribe") : window.location.href = getLoginUrl()}
              >
                {isAuthenticated ? "Subscribe Now" : "Login to Subscribe"}
              </Button>
            </CardContent>
          </Card>
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
