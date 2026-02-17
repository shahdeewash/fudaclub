import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Building2, Users, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function Subscribe() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState(user?.email || "");
  const [step, setStep] = useState<"email" | "confirm" | "success">("email");
  const [detectedCompany, setDetectedCompany] = useState<{ id: number; name: string; domain: string; colleagueCount: number } | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const utils = trpc.useUtils();

  const createSubscription = trpc.subscription.create.useMutation({
    onSuccess: () => {
      setStep("success");
      toast.success("Subscription created successfully!");
      setTimeout(() => {
        setLocation("/menu");
      }, 2000);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create subscription");
    },
  });

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
    console.log("handleConfirmSubscription called", { detectedCompany, user });
    if (!detectedCompany) {
      toast.error("No company detected");
      return;
    }
    if (!user) {
      toast.error("User not authenticated");
      return;
    }
    toast.info("Creating subscription...");
    createSubscription.mutate({ companyId: detectedCompany.id });
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
        {step === "email" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Subscribe to Corporate Lunch Deal</CardTitle>
              <CardDescription>
                Enter your work email to get started. We'll automatically detect your company.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Work Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isDetecting}
                  />
                  <p className="text-sm text-muted-foreground">
                    Use your company email to join your colleagues
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isDetecting}
                >
                  {isDetecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Detecting Company...
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </form>

              <div className="pt-6 border-t">
                <h3 className="font-semibold mb-3">What You'll Get:</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-secondary mt-0.5" />
                    <div>
                      <p className="font-medium">$25/fortnight subscription</p>
                      <p className="text-sm text-muted-foreground">One free meal daily (valued at $18)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-secondary mt-0.5" />
                    <div>
                      <p className="font-medium">Free delivery when 5+ colleagues order</p>
                      <p className="text-sm text-muted-foreground">Save $8 on delivery fees</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-secondary mt-0.5" />
                    <div>
                      <p className="font-medium">Access to Today's Special</p>
                      <p className="text-sm text-muted-foreground">Exclusive daily featured items</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "confirm" && detectedCompany && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Confirm Your Subscription</CardTitle>
              <CardDescription>Review your company details and complete subscription</CardDescription>
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

              <div className="bg-muted p-6 rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold">Subscription Fee</span>
                  <span className="text-2xl font-bold">$25</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Billed every 2 weeks • Cancel anytime
                </p>
              </div>

              <Alert variant="default" className="border-secondary/50 bg-secondary/10">
                <AlertCircle className="h-4 w-4 text-secondary" />
                <AlertDescription className="text-sm">
                  <strong>Note:</strong> This is an MVP demo. Payment processing is simulated. In production, this would integrate with Stripe for real payments.
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep("email")}
                  className="flex-1"
                  disabled={createSubscription.isPending}
                >
                  Back
                </Button>
                <Button
                  onClick={handleConfirmSubscription}
                  className="flex-1"
                  size="lg"
                  disabled={createSubscription.isPending}
                >
                  {createSubscription.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Confirm Subscription"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "success" && (
          <Card className="border-secondary">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-secondary/20 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-secondary" />
              </div>
              <CardTitle className="text-2xl">Subscription Activated!</CardTitle>
              <CardDescription>Welcome to FÜDA Corporate Lunch Deal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">
                  Your subscription is now active. You can start ordering lunch with your daily credit.
                </p>
              </div>

              <div className="bg-muted p-6 rounded-lg space-y-3">
                <h3 className="font-semibold">Next Steps:</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5" />
                    <span>Browse the menu and select your lunch</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5" />
                    <span>Your first item is free every day ($0.00)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5" />
                    <span>Order before 10:30 AM for same-day delivery</span>
                  </li>
                </ul>
              </div>

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
