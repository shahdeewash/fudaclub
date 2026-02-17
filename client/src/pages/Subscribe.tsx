import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Users, Truck, DollarSign } from "lucide-react";
import { toast } from "sonner";

export default function Subscribe() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "confirm">("email");
  const [companyInfo, setCompanyInfo] = useState<{ name: string; colleagueCount: number } | null>(null);

  const detectCompany = trpc.company.detectFromEmail.useQuery(
    { email },
    { enabled: false }
  );

  const createSubscription = trpc.subscription.create.useMutation({
    onSuccess: () => {
      toast.success("Subscription activated!");
      setLocation("/menu");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const result = await detectCompany.refetch();
      if (result.data) {
        setCompanyInfo({
          name: result.data.company.name,
          colleagueCount: result.data.colleagueCount,
        });
        setStep("confirm");
      }
    } catch (error) {
      toast.error("Invalid email format");
    }
  };

  const handleSubscribe = async () => {
    if (!detectCompany.data) return;

    createSubscription.mutate({
      companyId: detectCompany.data.company.id,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-4 shadow-md">
        <div className="container">
          <h1 className="text-2xl font-bold">FÜDA Corporate Lunch</h1>
          <p className="text-sm opacity-90">Global Street Bites</p>
        </div>
      </header>

      <main className="container py-12 max-w-2xl">
        {step === "email" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl">Join Corporate Lunch Deal</CardTitle>
              <CardDescription className="text-lg">
                Subscribe for $25/fortnight and enjoy daily lunch credits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Benefits */}
              <div className="grid gap-4">
                <div className="flex items-start gap-3">
                  <DollarSign className="h-6 w-6 text-secondary mt-1" />
                  <div>
                    <h3 className="font-semibold">Daily Free Meal</h3>
                    <p className="text-sm text-muted-foreground">
                      First meal free every day (valued at $18)
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Truck className="h-6 w-6 text-secondary mt-1" />
                  <div>
                    <h3 className="font-semibold">Free Delivery</h3>
                    <p className="text-sm text-muted-foreground">
                      When 5+ colleagues order (saves $8)
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="h-6 w-6 text-secondary mt-1" />
                  <div>
                    <h3 className="font-semibold">Team Collaboration</h3>
                    <p className="text-sm text-muted-foreground">
                      See who's ordering and coordinate deliveries
                    </p>
                  </div>
                </div>
              </div>

              {/* Email Form */}
              <form onSubmit={handleEmailSubmit} className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    We'll automatically detect your company from your email domain
                  </p>
                </div>

                <Button type="submit" className="w-full" size="lg">
                  Continue
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Confirm Subscription</CardTitle>
              <CardDescription>
                Review your details before subscribing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Company Info */}
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <strong>Company detected:</strong> {companyInfo?.name}
                </AlertDescription>
              </Alert>

              {companyInfo && companyInfo.colleagueCount > 0 && (
                <Alert>
                  <Users className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{companyInfo.colleagueCount} colleagues</strong> already subscribed!
                  </AlertDescription>
                </Alert>
              )}

              {/* Subscription Details */}
              <div className="space-y-3 p-4 bg-muted rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company</span>
                  <span className="font-medium">{companyInfo?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billing</span>
                  <span className="font-medium">$25.00 every 2 weeks</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Daily Benefit</span>
                  <span className="font-medium text-secondary">1 free meal</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep("email")}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleSubscribe}
                  disabled={createSubscription.isPending}
                  className="flex-1"
                  size="lg"
                >
                  {createSubscription.isPending ? "Processing..." : "Subscribe Now"}
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                By subscribing, you agree to our terms. Cancel anytime.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
