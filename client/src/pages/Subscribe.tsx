import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Building2, Users, Loader2, AlertCircle,
  Settings, ExternalLink, CreditCard, Calendar, Zap
} from "lucide-react";
import { toast } from "sonner";

type PlanType = "fortnightly" | "monthly";

const PLANS: Record<PlanType, {
  label: string;
  price: string;
  billingLabel: string;
  priceNote: string;
  badge?: string;
  features: string[];
}> = {
  fortnightly: {
    label: "Fortnightly",
    price: "$270",
    billingLabel: "Billed every 2 weeks",
    priceNote: "~$19.29/day",
    features: [
      "Daily free meal credit (up to $18 value)",
      "Free delivery when 5+ colleagues order",
      "Access to Today's Special",
      "Priority pickup lane",
    ],
  },
  monthly: {
    label: "Monthly",
    price: "$500",
    billingLabel: "Billed monthly",
    priceNote: "~$16.67/day • Save ~$40",
    badge: "Best Value",
    features: [
      "Daily free meal credit (up to $18 value)",
      "Free delivery when 5+ colleagues order",
      "Access to Today's Special",
      "Priority pickup lane",
      "Save ~$40 vs fortnightly billing",
    ],
  },
};

export default function Subscribe() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState(user?.email || "");
  const [step, setStep] = useState<"plan" | "email" | "confirm" | "success">("plan");
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("monthly");
  const [detectedCompany, setDetectedCompany] = useState<{ id: number; name: string; domain: string; colleagueCount: number } | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const utils = trpc.useUtils();

  const { data: subscription, isLoading: isLoadingSubscription } = trpc.subscription.getStatus.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const getPortalUrl = trpc.subscription.getPortalUrl.useMutation({
    onSuccess: (data) => {
      window.open(data.portalUrl, "_blank");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to open subscription portal");
    },
  });

  const createCheckout = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        toast.info("Redirecting to Stripe Checkout...");
        window.open(data.checkoutUrl, "_blank");
      } else {
        toast.error("Failed to get checkout URL");
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to start checkout");
    },
  });

  const handlePlanSelect = (plan: PlanType) => {
    setSelectedPlan(plan);
    setStep("email");
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setIsDetecting(true);
    try {
      const data = await utils.client.company.detectFromEmail.query({ email });
      setDetectedCompany({
        id: data.company.id,
        name: data.company.name,
        domain: data.company.domain,
        colleagueCount: data.colleagueCount,
      });
      setStep("confirm");
    } catch (error: any) {
      toast.error(error.message || "Failed to detect company");
    } finally {
      setIsDetecting(false);
    }
  };

  const handleConfirmSubscription = () => {
    if (!detectedCompany || !user) {
      toast.error("Missing company or user information");
      return;
    }
    createCheckout.mutate({
      companyId: detectedCompany.id,
      origin: window.location.origin,
      planType: selectedPlan,
    });
  };

  const handleManageSubscription = () => {
    getPortalUrl.mutate({ returnUrl: window.location.href });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please log in to subscribe</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = "/api/oauth/login"} className="w-full">
              Log In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const plan = PLANS[selectedPlan];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-6 shadow-md">
        <div className="container">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">FÜDA</h1>
              <p className="text-sm opacity-90">Global Street Bites</p>
            </div>
            <Button variant="secondary" onClick={() => setLocation("/")}>
              Back to Home
            </Button>
          </div>
        </div>
      </header>

      <div className="container max-w-2xl py-12">

        {/* ── Active subscription panel ── */}
        {isLoadingSubscription ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : subscription?.status === "active" ? (
          <Card className="border-secondary mb-8">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary/20 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-secondary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Active Subscription</CardTitle>
                  <CardDescription>
                    {subscription.planType === "monthly" ? "Monthly Plan — $500/month" : "Fortnightly Plan — $270/fortnight"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Period Start</span>
                  </div>
                  <p className="font-semibold">
                    {subscription.periodStart
                      ? new Date(subscription.periodStart).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
                      : "—"}
                  </p>
                </div>
                <div className="bg-muted rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Next Billing</span>
                  </div>
                  <p className="font-semibold">
                    {subscription.periodEnd
                      ? new Date(subscription.periodEnd).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
                      : "—"}
                  </p>
                </div>
              </div>

              {subscription.cancelAtPeriodEnd && (
                <Alert variant="default" className="border-yellow-400 bg-yellow-50">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    Your subscription is set to cancel at the end of the current period. You can reactivate it via the portal.
                  </AlertDescription>
                </Alert>
              )}

              {subscription.hasStripeCustomer ? (
                <Button
                  onClick={handleManageSubscription}
                  disabled={getPortalUrl.isPending}
                  className="w-full"
                  size="lg"
                >
                  {getPortalUrl.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening Portal...</>
                  ) : (
                    <><Settings className="mr-2 h-4 w-4" />Manage Subscription<ExternalLink className="ml-2 h-3 w-3 opacity-60" /></>
                  )}
                </Button>
              ) : (
                <Alert>
                  <CreditCard className="h-4 w-4" />
                  <AlertDescription>
                    Your subscription was activated manually. To manage billing, please contact support.
                  </AlertDescription>
                </Alert>
              )}

              <p className="text-xs text-center text-muted-foreground">
                The Stripe portal lets you update payment details, view invoices, and cancel your subscription.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {/* ── Plan selection step ── */}
        {!subscription && step === "plan" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-2">Choose Your Plan</h2>
              <p className="text-muted-foreground">Manage team subscriptions and billing for FÜDA daily lunch.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(Object.entries(PLANS) as [PlanType, typeof PLANS[PlanType]][]).map(([key, p]) => (
                <Card
                  key={key}
                  className={`relative cursor-pointer transition-all hover:shadow-md ${key === "monthly" ? "border-secondary ring-1 ring-secondary" : "border-border"}`}
                  onClick={() => handlePlanSelect(key)}
                >
                  {p.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-secondary text-secondary-foreground px-3 py-1">
                        <Zap className="h-3 w-3 mr-1" />{p.badge}
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-2 pt-6">
                    <CardTitle className="text-lg">{p.label}</CardTitle>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">{p.price}</span>
                      <span className="text-muted-foreground text-sm">AUD</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{p.billingLabel}</p>
                    <p className="text-xs font-medium text-secondary">{p.priceNote}</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {p.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                        <span className="text-sm">{f}</span>
                      </div>
                    ))}
                    <Button className="w-full mt-4" variant={key === "monthly" ? "default" : "outline"}>
                      Select {p.label}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── Email step ── */}
        {!subscription && step === "email" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">Enter Your Work Email</CardTitle>
                  <CardDescription>We'll automatically detect your company.</CardDescription>
                </div>
                <Badge variant="outline" className="text-sm shrink-0">
                  {plan.label} · {plan.price}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">Work Email Address</label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isDetecting}
                  />
                  <p className="text-sm text-muted-foreground">Use your company email to join your colleagues</p>
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={isDetecting}>
                  {isDetecting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Detecting Company...</>
                  ) : "Continue"}
                </Button>
              </form>
              <Button variant="ghost" className="w-full" onClick={() => setStep("plan")}>
                ← Change Plan
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Confirm step ── */}
        {!subscription && step === "confirm" && detectedCompany && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">Confirm Subscription</CardTitle>
                  <CardDescription>Review your details and complete payment</CardDescription>
                </div>
                <Badge variant="outline" className="text-sm shrink-0">
                  {plan.label} · {plan.price}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <Building2 className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-semibold">{detectedCompany.name}</p>
                    <p className="text-sm text-muted-foreground">{detectedCompany.domain}</p>
                  </div>
                </AlertDescription>
              </Alert>

              {detectedCompany.colleagueCount > 0 && (
                <Alert>
                  <Users className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-semibold">
                      {detectedCompany.colleagueCount} colleague{detectedCompany.colleagueCount !== 1 ? "s" : ""} already subscribed!
                    </p>
                    <p className="text-sm text-muted-foreground">Join your team for lunch</p>
                  </AlertDescription>
                </Alert>
              )}

              <div className="bg-muted p-6 rounded-lg space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-lg font-semibold">{plan.label} Plan</p>
                    <p className="text-sm text-muted-foreground">{plan.billingLabel}</p>
                  </div>
                  <span className="text-3xl font-bold">{plan.price}</span>
                </div>
                <p className="text-xs text-muted-foreground">{plan.priceNote} • Cancel anytime</p>
              </div>

              <Alert variant="default" className="border-secondary/50 bg-secondary/10">
                <AlertCircle className="h-4 w-4 text-secondary" />
                <AlertDescription className="text-sm">
                  You'll be redirected to Stripe's secure checkout. Use card <strong>4242 4242 4242 4242</strong> for testing.
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("email")} className="flex-1" disabled={createCheckout.isPending}>
                  Back
                </Button>
                <Button onClick={handleConfirmSubscription} className="flex-1" size="lg" disabled={createCheckout.isPending}>
                  {createCheckout.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirecting...</>
                  ) : "Pay with Stripe"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Success step (fallback — normally handled by SubscriptionSuccess page) ── */}
        {!subscription && step === "success" && (
          <Card className="border-secondary">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-secondary/20 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-secondary" />
              </div>
              <CardTitle className="text-2xl">Subscription Activated!</CardTitle>
              <CardDescription>Welcome to FÜDA Daily Lunch</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-center text-muted-foreground">
                Your subscription is now active. You can start ordering lunch with your daily credit.
              </p>
              <Button onClick={() => setLocation("/menu")} className="w-full" size="lg">
                Start Ordering
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
