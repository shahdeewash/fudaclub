import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Loader2, XCircle, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function PaymentSuccess() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrivedStatus, setArrivedStatus] = useState<"idle" | "loading" | "done">("idle");
  const hasProcessed = useRef(false);

  // Extract session_id from URL
  const searchParams = new URLSearchParams(window.location.search);
  const sessionId = searchParams.get("session_id");

  const verifyAndCreateOrder = trpc.payment.verifyAndCreateOrder.useMutation({
    onSuccess: (data) => {
      setOrderNumber(data.orderNumber);
      setOrderId(data.orderId ?? null);
      toast.success("Order placed successfully!");
      // Clear cart
      localStorage.removeItem("fuda_cart");
      localStorage.removeItem("fuda_special_instructions");
      window.dispatchEvent(new Event("cartUpdated"));
    },
    onError: (err: any) => {
      setError(err.message || "Failed to create order after payment");
      toast.error(err.message || "Failed to create order");
    },
  });

  const markArrived = trpc.stats.markArrived.useMutation({
    onSuccess: () => {
      setArrivedStatus("done");
      toast.success("Great! The kitchen has been notified you're here.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to mark arrival");
      setArrivedStatus("idle");
    },
  });

  useEffect(() => {
    if (!isAuthenticated || !sessionId || hasProcessed.current) return;
    hasProcessed.current = true;
    verifyAndCreateOrder.mutate({ sessionId });
  }, [isAuthenticated, sessionId]);

  const handleImHere = () => {
    if (!orderId) return;
    setArrivedStatus("loading");
    markArrived.mutate({ orderId });
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invalid Page</CardTitle>
            <CardDescription>No payment session found</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/menu")} className="w-full">
              Browse Menu
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-destructive">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Order Creation Failed</CardTitle>
            <CardDescription>Your payment was received but we couldn't create your order</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Please contact support with your session ID: <code className="text-xs bg-muted px-1 rounded">{sessionId}</code>
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button onClick={() => setLocation("/orders")} className="w-full">
              View My Orders
            </Button>
            <Button variant="outline" onClick={() => setLocation("/menu")} className="w-full">
              Browse Menu
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (orderNumber) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-secondary">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-secondary/20 flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-secondary" />
            </div>
            <CardTitle className="text-3xl">Payment Successful!</CardTitle>
            <CardDescription className="text-lg">Order #{orderNumber}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-secondary/50 bg-secondary/10">
              <CheckCircle2 className="h-4 w-4 text-secondary" />
              <AlertDescription>
                Your payment has been processed and your order is confirmed.
              </AlertDescription>
            </Alert>

            {/* I'm Here button — triggers kitchen to start preparing */}
            {arrivedStatus === "done" ? (
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-4 text-center space-y-1">
                <MapPin className="h-6 w-6 text-primary mx-auto" />
                <p className="font-semibold text-primary">You're checked in!</p>
                <p className="text-sm text-muted-foreground">The kitchen has been notified and will start preparing your order.</p>
              </div>
            ) : (
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <p className="text-sm font-medium text-center">Arrived at the pickup point?</p>
                <Button
                  onClick={handleImHere}
                  disabled={arrivedStatus === "loading" || !orderId}
                  className="w-full"
                  size="lg"
                  variant="default"
                >
                  {arrivedStatus === "loading" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Notifying kitchen...
                    </>
                  ) : (
                    <>
                      <MapPin className="mr-2 h-4 w-4" />
                      I'm Here — Start My Order
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Tap when you arrive so the kitchen can start preparing your meal.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={() => setLocation("/orders")} className="w-full" variant="outline">
              View My Orders
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Loading state while processing
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
          </div>
          <CardTitle className="text-2xl">Processing Your Order</CardTitle>
          <CardDescription>Please wait while we confirm your payment and create your order...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Verifying payment with Stripe...</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
