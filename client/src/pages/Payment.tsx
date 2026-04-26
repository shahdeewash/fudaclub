import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CreditCard, Lock, ArrowLeft, Loader2, ShieldCheck, ExternalLink } from "lucide-react";
import { CartIndicator } from "@/components/CartIndicator";
import { toast } from "sonner";

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  modifierNote?: string;
}

export default function Payment() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { data: subscription } = trpc.subscription.getMine.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  // FÜDA Club membership — separate from corporate `subscription`. Either grants checkout.
  const { data: clubStatus } = trpc.fudaClub.getStatus.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const isClubMember = !!(clubStatus?.subscription && clubStatus.subscription.status !== "canceled");
  const hasAnyMembership = !!subscription || isClubMember;

  const { data: dailyCredit } = trpc.order.getDailyCredit.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: colleagues } = trpc.order.getColleaguesWhoOrdered.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const utils = trpc.useUtils();

  // CORPORATE PATH (B2B users with companyId): $0 orders use trpc.order.create
  const createOrder = trpc.order.create.useMutation({
    onSuccess: (data) => {
      setOrderPlaced(true);
      setOrderNumber(data.order.orderNumber);
      toast.success("Order placed successfully!");
      utils.order.getColleaguesWhoOrdered.invalidate();
      utils.order.getDailyCredit.invalidate();

      localStorage.removeItem("fuda_cart");
      window.dispatchEvent(new Event("cartUpdated"));

      setTimeout(() => {
        setLocation("/orders");
      }, 3000);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to place order");
    },
  });

  // CORPORATE PATH: paid orders use trpc.payment.createCheckoutSession
  const createCheckoutSession = trpc.payment.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Failed to create checkout session");
        setIsRedirecting(false);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to initiate payment");
      setIsRedirecting(false);
    },
  });

  // CLUB PATH (FÜDA Club personal members): handles BOTH free orders (covered by coin)
  // AND paid orders. Returns either an immediate orderId+orderNumber for $0 orders,
  // or a Stripe checkoutUrl for paid orders.
  const createFoodCheckout = trpc.fudaClub.createFoodCheckout.useMutation({
    onSuccess: (data) => {
      localStorage.removeItem("fuda_cart");
      window.dispatchEvent(new Event("cartUpdated"));
      if (data.requiresPayment && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.orderNumber) {
        setOrderPlaced(true);
        setOrderNumber(data.orderNumber);
        toast.success("Order placed using your FÜDA Coin!");
        utils.fudaClub.getStatus.invalidate();
        setTimeout(() => setLocation("/orders"), 3000);
      } else {
        toast.error("Unexpected response from server");
        setIsRedirecting(false);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to place order");
      setIsRedirecting(false);
    },
  });

  // Load cart and special instructions from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem("fuda_cart");
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        setCartItems(parsed);
      } catch (e) {
        console.error("Failed to parse cart:", e);
      }
    }
    const savedInstructions = localStorage.getItem("fuda_special_instructions");
    if (savedInstructions) {
      setSpecialInstructions(savedInstructions);
    }
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Login Required</CardTitle>
            <CardDescription>Please login to complete payment</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = "/api/oauth/login"} className="w-full">
              Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasAnyMembership) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Membership Required</CardTitle>
            <CardDescription>
              Join The FÜDA Club to order — daily coin + 10% off every order.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => setLocation("/fuda-club")}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
            >
              Join The FÜDA Club
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (cartItems.length === 0 && !orderPlaced) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Cart is Empty</CardTitle>
            <CardDescription>Add items to your cart before proceeding to payment</CardDescription>
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

  // Calculate pricing.
  // Club members use their FÜDA Coin balance (1 coin = 1 free item, expires in 2 days).
  // Corporate B2B users use the per-day "daily credit" (1 free item per day).
  // If you don't have whichever applies to you, no free-item line is shown.
  const coinBalance = clubStatus?.coinBalance ?? 0;
  const hasDailyCredit = isClubMember
    ? coinBalance > 0
    : !!(dailyCredit?.available && !dailyCredit?.usedToday);

  let subtotal = 0;
  if (hasDailyCredit && cartItems.length > 0) {
    const firstItem = cartItems[0];
    const firstItemTotal = firstItem.price * (firstItem.quantity - 1);
    subtotal += firstItemTotal;
    const otherItemsTotal = cartItems.slice(1).reduce((sum, item) => sum + (item.price * item.quantity), 0);
    subtotal += otherItemsTotal;
  } else {
    subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  const colleagueCount = colleagues?.length || 0;
  const deliveryThreshold = 5;
  const isFreeDelivery = colleagueCount >= deliveryThreshold;
  const deliveryFee = isFreeDelivery ? 0 : 800;
  const tax = Math.round((subtotal + deliveryFee) * 0.1);
  const total = subtotal + deliveryFee + tax;

  const isZeroTotal = total === 0;

  const handleFreeOrder = () => {
    const items = cartItems.map(item => ({
      menuItemId: item.id,
      quantity: item.quantity,
      modifierNote: item.modifierNote,
    }));
    if (isClubMember) {
      // Club path: createFoodCheckout handles $0 case directly (no Stripe round trip).
      createFoodCheckout.mutate({
        items,
        origin: window.location.origin,
        venueOrderCount: colleagueCount,
        specialInstructions: specialInstructions || undefined,
      });
    } else {
      // Corporate path: original B2B order create
      createOrder.mutate({
        items,
        specialInstructions: specialInstructions || undefined,
      });
    }
  };

  const handleStripeCheckout = () => {
    setIsRedirecting(true);

    // Club members: route through fudaClub.createFoodCheckout, which handles
    // coin redemption + 10% member discount + Stripe session creation server-side.
    if (isClubMember) {
      const items = cartItems.map(item => ({
        menuItemId: item.id,
        quantity: item.quantity,
        modifierNote: item.modifierNote,
      }));
      createFoodCheckout.mutate({
        items,
        origin: window.location.origin,
        venueOrderCount: colleagueCount,
        specialInstructions: specialInstructions || undefined,
      });
      return;
    }

    // CORPORATE PATH below — unchanged from before
    // Build line items for Stripe - apply daily credit logic
    const stripeLineItems: Array<{ name: string; price: number; quantity: number; imageUrl?: string }> = [];

    if (hasDailyCredit && cartItems.length > 0) {
      const firstItem = cartItems[0];
      // First unit is free - only charge remaining quantity
      if (firstItem.quantity > 1) {
        stripeLineItems.push({
          name: firstItem.name,
          price: firstItem.price,
          quantity: firstItem.quantity - 1,
          imageUrl: firstItem.imageUrl,
        });
      }
      // Add remaining items at full price
      cartItems.slice(1).forEach(item => {
        stripeLineItems.push({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
        });
      });
    } else {
      cartItems.forEach(item => {
        stripeLineItems.push({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
        });
      });
    }

    // Add delivery fee as line item if applicable
    if (deliveryFee > 0) {
      stripeLineItems.push({
        name: "Delivery Fee",
        price: deliveryFee,
        quantity: 1,
      });
    }

    // Build order data to pass through Stripe metadata
    const orderData = {
      items: cartItems.map(item => ({
        menuItemId: item.id,
        quantity: item.quantity,
        price: item.price,
        modifierNote: item.modifierNote,
      })),
      deliveryFee,
      tax,
      dailyCreditApplied: hasDailyCredit || false,
    };

    createCheckoutSession.mutate({
      cartItems: stripeLineItems,
      totalAmount: total,
      origin: window.location.origin,
      orderData,
    });
  };

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full border-secondary">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-secondary/20 flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-secondary" />
            </div>
            <CardTitle className="text-3xl">Order Confirmed!</CardTitle>
            <CardDescription className="text-lg">Order #{orderNumber}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="border-secondary/50 bg-secondary/10">
              <CheckCircle2 className="h-4 w-4 text-secondary" />
              <AlertDescription>
                Your order is fully covered by your daily credit — no payment needed!
              </AlertDescription>
            </Alert>
            <div className="text-center text-sm text-muted-foreground">
              Redirecting to orders page...
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={() => setLocation("/orders")} className="w-full" size="lg">
              View My Orders
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-4 shadow-md sticky top-0 z-10">
        <div className="container flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">
              {isZeroTotal ? "Confirm Order" : "Payment"}
            </h1>
            <p className="text-xs opacity-90">
              {isZeroTotal ? "Your order is fully covered by daily credit" : "Secure payment via Stripe"}
            </p>
          </div>
          <div className="flex gap-2">
            <CartIndicator />
            <Button variant="secondary" size="sm" onClick={() => setLocation("/checkout")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Checkout
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Payment Section */}
          <div className="lg:col-span-2 space-y-4">
            {isZeroTotal ? (
              /* Zero Total - No payment needed */
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-6 w-6 text-secondary" />
                    No Payment Required
                  </CardTitle>
                  <CardDescription>
                    Your daily credit covers the entire order
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert className="border-secondary/50 bg-secondary/10">
                    <ShieldCheck className="h-4 w-4 text-secondary" />
                    <AlertDescription>
                      <p className="font-semibold">Daily Credit Applied</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your subscription includes one free meal per day. Today's credit has been applied to this order, making it completely free!
                      </p>
                    </AlertDescription>
                  </Alert>
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={handleFreeOrder}
                    className="w-full"
                    size="lg"
                    disabled={createOrder.isPending || createFoodCheckout.isPending}
                  >
                    {(createOrder.isPending || createFoodCheckout.isPending) ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Placing Order...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-5 w-5" />
                        Place Order (Free)
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            ) : (
              /* Stripe Checkout */
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Secure Payment
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    You'll be redirected to Stripe's secure checkout
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                      <p className="font-medium text-sm">Powered by Stripe</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Your payment is processed securely by Stripe. We never store your card details.
                        Accepted: Visa, Mastercard, AMEX, Apple Pay, Google Pay.
                      </p>
                    </AlertDescription>
                  </Alert>

                  <div className="flex justify-center flex-wrap gap-2 py-2">
                    <Badge variant="outline" className="text-xs px-3 py-1">VISA</Badge>
                    <Badge variant="outline" className="text-xs px-3 py-1">Mastercard</Badge>
                    <Badge variant="outline" className="text-xs px-3 py-1">AMEX</Badge>
                    <Badge variant="outline" className="text-xs px-3 py-1">Apple Pay</Badge>
                    <Badge variant="outline" className="text-xs px-3 py-1">Google Pay</Badge>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={handleStripeCheckout}
                    className="w-full"
                    size="lg"
                    disabled={isRedirecting || createCheckoutSession.isPending || createFoodCheckout.isPending}
                  >
                    {(isRedirecting || createCheckoutSession.isPending || createFoodCheckout.isPending) ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Redirecting to Stripe...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="mr-2 h-5 w-5" />
                        Pay ${(total / 100).toFixed(2)} via Stripe
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>

          {/* Order Summary */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Items */}
                <div className="space-y-2">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-sm">
                        <span>{item.quantity}x {item.name}</span>
                        <span>${(item.price * item.quantity / 100).toFixed(2)}</span>
                      </div>
                      {item.modifierNote && (
                        <p className="text-xs text-muted-foreground pl-3">{item.modifierNote}</p>
                      )}
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>${(subtotal / 100).toFixed(2)}</span>
                  </div>
                  {hasDailyCredit && (
                    <div className="flex justify-between text-sm text-secondary">
                      <span>Daily Credit</span>
                      <span>-${((cartItems[0]?.price || 0) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span>Delivery Fee</span>
                    <span className={isFreeDelivery ? "text-secondary" : ""}>
                      {isFreeDelivery ? "FREE" : `$${(deliveryFee / 100).toFixed(2)}`}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tax (10%)</span>
                    <span>${(tax / 100).toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className={isZeroTotal ? "text-secondary" : ""}>
                      {isZeroTotal ? "FREE" : `$${(total / 100).toFixed(2)}`}
                    </span>
                  </div>
                </div>

                {hasDailyCredit && (
                  <Alert className="border-secondary/50 bg-secondary/10">
                    <CheckCircle2 className="h-4 w-4 text-secondary" />
                    <AlertDescription className="text-sm">
                      Daily credit applied to first item
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
