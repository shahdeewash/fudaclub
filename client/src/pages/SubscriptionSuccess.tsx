import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get("session_id");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const activateSub = trpc.subscription.activateFromSession.useMutation({
    onSuccess: () => {
      setStatus("success");
      toast.success("Subscription activated! Welcome to FÜDA.");
    },
    onError: (err: any) => {
      setStatus("error");
      setErrorMsg(err.message || "Failed to activate subscription");
    },
  });

  useEffect(() => {
    if (sessionId) {
      activateSub.mutate({ sessionId });
    } else {
      setStatus("error");
      setErrorMsg("No session ID found. Please contact support.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        {status === "loading" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
              <CardTitle>Activating your subscription…</CardTitle>
              <CardDescription>Please wait while we confirm your payment.</CardDescription>
            </CardHeader>
          </>
        )}

        {status === "success" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-secondary/20 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-secondary" />
              </div>
              <CardTitle className="text-2xl">Subscription Activated!</CardTitle>
              <CardDescription>Welcome to FÜDA Daily Lunch</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                <p className="font-semibold">What's next:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>✓ Your first meal is free every day</li>
                  <li>✓ Order before 10:30 AM for same-day delivery</li>
                  <li>✓ Free delivery when 5+ colleagues order</li>
                </ul>
              </div>
              <Button onClick={() => setLocation("/menu")} className="w-full" size="lg">
                Browse the Menu
              </Button>
            </CardContent>
          </>
        )}

        {status === "error" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
              </div>
              <CardTitle>Activation Failed</CardTitle>
              <CardDescription>{errorMsg}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Your payment may have been processed. Please contact support or check your email.
              </p>
              <Button variant="outline" onClick={() => setLocation("/subscribe")} className="w-full">
                Back to Subscribe
              </Button>
              <Button onClick={() => setLocation("/menu")} className="w-full">
                Go to Menu
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
