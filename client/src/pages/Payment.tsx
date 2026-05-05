import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthGate } from "@/components/AuthGate";
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
  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "delivery">("pickup");
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);
  // Member-controlled count of FÜDA Coins to spend on THIS order. Initial value
  // comes from localStorage so the choice the member made on /checkout carries
  // through. null sentinel means "use all available". Capped to coinBalance and
  // to eligible (non-Mix-Grill) cart units below.
  const [coinsToUse, setCoinsToUse] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem("fuda_coins_to_use");
    return stored !== null ? parseInt(stored, 10) : null;
  });
  // Schedule-ahead pickup time set on /checkout, picked up here for the mutation.
  const scheduledFor = (typeof window !== "undefined")
    ? (window.localStorage.getItem("fuda_scheduled_for") || undefined)
    : undefined;
  // Persist any change here so a back-nav to /checkout sees the same value.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (coinsToUse !== null) {
      window.localStorage.setItem("fuda_coins_to_use", String(coinsToUse));
    }
  }, [coinsToUse]);

  const { data: subscription } = trpc.subscription.getMine.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  // FÜDA Club membership — separate from corporate `subscription`. Either grants checkout.
  const { data: clubStatus } = trpc.fudaClub.getStatus.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const isClubMember = !!(clubStatus?.subscription && clubStatus.subscription.status !== "canceled");
  // Coin grace mode: member cancelled but is still inside the paid period — they
  // can spend remaining coins but get NO 10% off on anything else.
  const inCoinGrace = !!clubStatus?.coinGrace?.active;
  const coinGraceUntil = clubStatus?.coinGrace?.until
    ? new Date(clubStatus.coinGrace.until)
    : null;
  // Either path (full member or grace) lets the user place a club order.
  const canOrderAsClub = isClubMember || inCoinGrace;
  const hasAnyMembership = !!subscription || canOrderAsClub;

  const { data: dailyCredit } = trpc.order.getDailyCredit.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: colleagues } = trpc.order.getColleaguesWhoOrdered.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: venueStatus } = trpc.fudaClub.getVenueStatus.useQuery(undefined, {
    enabled: isAuthenticated && isClubMember,
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
      // Clear the coin-spend choice + schedule so the NEXT order defaults fresh.
      localStorage.removeItem("fuda_coins_to_use");
      localStorage.removeItem("fuda_scheduled_for");
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

  // Load cart, instructions, fulfillment from localStorage on mount AND keep
  // the cart in sync with the CartIndicator dropdown (which dispatches
  // "cartUpdated" whenever the user adds/removes items).
  useEffect(() => {
    const loadCart = () => {
      const savedCart = localStorage.getItem("fuda_cart");
      if (savedCart) {
        try {
          setCartItems(JSON.parse(savedCart));
        } catch (e) {
          console.error("Failed to parse cart:", e);
          setCartItems([]);
        }
      } else {
        setCartItems([]);
      }
    };
    loadCart();
    const savedInstructions = localStorage.getItem("fuda_special_instructions");
    if (savedInstructions) {
      setSpecialInstructions(savedInstructions);
    }
    const savedFulfillment = localStorage.getItem("fuda_fulfillment_type");
    if (savedFulfillment === "delivery" || savedFulfillment === "pickup") {
      setFulfillmentType(savedFulfillment);
    }
    window.addEventListener("cartUpdated", loadCart);
    window.addEventListener("storage", loadCart);
    return () => {
      window.removeEventListener("cartUpdated", loadCart);
      window.removeEventListener("storage", loadCart);
    };
  }, []);

  if (!isAuthenticated) {
    return <AuthGate reason="Please log in to complete payment." />;
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

  // Subtotal calculation depends on user type so the cart display matches what
  // the backend actually charges. Club members see 10% off every item (and one
  // item free if they have a coin); corporate users see one item free if they
  // have today's credit.
  const CLUB_DISCOUNT = 0.10;
  let subtotal = 0;
  let memberDiscountSavings = 0;
  let coinDiscountSavings = 0;

  // Coin-ineligible items mirror — server is source of truth (uses the
  // menuItems.coinEligible flag). Client name-matches against the known
  // meal-deal + Mix Grill patterns for the in-flight preview only.
  const COIN_INELIGIBLE_NAME_PATTERNS = [
    /mix\s*grill/i,
    /\bcombo\b/i,
    /\bdeal\b/i,
    /\bspecial\b.*momo|momo.*\bspecial\b/i,
    /family feast/i,
    /dinner for two/i,
    /kebab plate/i,
    /week\s*day/i,
  ];
  const isMixGrillItem = (name: string) =>
    COIN_INELIGIBLE_NAME_PATTERNS.some((re) => re.test(name));

  // Compute eligible (non-Mix-Grill) unit count — caps the coin selector.
  const eligibleUnitCount = canOrderAsClub
    ? cartItems.reduce(
        (sum, it) => sum + (isMixGrillItem(it.name) ? 0 : it.quantity),
        0
      )
    : 0;

  // Resolve the actual number of coins to spend: clamp the member's choice to
  // [0, min(coinBalance, eligibleUnitCount)]. Default = use all available.
  const maxCoinsSpendable = Math.min(coinBalance, eligibleUnitCount);
  const effectiveCoinsToUse = Math.min(
    coinsToUse ?? maxCoinsSpendable,
    maxCoinsSpendable
  );

  if (canOrderAsClub) {
    // Club math (mirrors server calculateClubPricing):
    //  1. Expand cart into individual units, mark Mix Grill ones as ineligible
    //  2. Sort eligible units by price DESCENDING
    //  3. Cover the top N (= effectiveCoinsToUse) with coins
    //  4. All other units get 10% off ONLY if member discount is active
    //     (grace-mode members lost the discount but can still spend coins).
    const effectiveDiscount = isClubMember ? CLUB_DISCOUNT : 0;
    type Unit = { price: number; eligible: boolean };
    const units: Unit[] = cartItems.flatMap(item => {
      const eligible = !isMixGrillItem(item.name);
      return Array.from({ length: item.quantity }, () => ({
        price: item.price,
        eligible,
      }));
    });
    const eligibleIdx = units
      .map((u, i) => ({ i, price: u.price, eligible: u.eligible }))
      .filter(x => x.eligible)
      .sort((a, b) => b.price - a.price)
      .slice(0, effectiveCoinsToUse)
      .map(x => x.i);
    const coinSet = new Set<number>(eligibleIdx);

    units.forEach((u, i) => {
      if (coinSet.has(i)) {
        coinDiscountSavings += u.price;
        // contributes 0 to subtotal
      } else {
        const discountedUnit = Math.round(u.price * (1 - effectiveDiscount));
        subtotal += discountedUnit;
        memberDiscountSavings += (u.price - discountedUnit);
      }
    });
  } else if (hasDailyCredit && cartItems.length > 0) {
    // Corporate: first unit of first item free, rest at full price
    const firstItem = cartItems[0];
    const firstItemTotal = firstItem.price * (firstItem.quantity - 1);
    subtotal += firstItemTotal;
    const otherItemsTotal = cartItems.slice(1).reduce((sum, item) => sum + (item.price * item.quantity), 0);
    subtotal += otherItemsTotal;
    coinDiscountSavings = firstItem.price;
  } else {
    subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  const colleagueCount = colleagues?.length || 0;
  const venueQualifiesForFreeDelivery = !!venueStatus?.qualifiesForFreeDelivery;
  const isPickup = fulfillmentType === "pickup";
  const isFreeDelivery = !isPickup && venueQualifiesForFreeDelivery;
  // Pickup = $0 always. Delivery = $10, OR free if 5+ active club members at workplace.
  const deliveryFee = isPickup ? 0 : (venueQualifiesForFreeDelivery ? 0 : 1000);
  // GST: corporate path adds tax separately, club path is GST-inclusive at the line item.
  const tax = isClubMember ? 0 : Math.round((subtotal + deliveryFee) * 0.1);
  const total = subtotal + deliveryFee + tax;

  const isZeroTotal = total === 0;

  const handleFreeOrder = () => {
    const items = cartItems.map(item => ({
      menuItemId: item.id,
      quantity: item.quantity,
      modifierNote: item.modifierNote,
    }));
    if (canOrderAsClub) {
      // Club path: createFoodCheckout handles $0 case directly (no Stripe round trip).
      createFoodCheckout.mutate({
        items,
        origin: window.location.origin,
        fulfillmentType,
        specialInstructions: specialInstructions || undefined,
        coinsToApply: effectiveCoinsToUse,
        scheduledFor: scheduledFor || undefined,
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

    // Club members (active OR coin-grace): route through fudaClub.createFoodCheckout,
    // which handles coin redemption + 10% member discount (active only) + Stripe
    // session creation server-side.
    if (canOrderAsClub) {
      const items = cartItems.map(item => ({
        menuItemId: item.id,
        quantity: item.quantity,
        modifierNote: item.modifierNote,
      }));
      createFoodCheckout.mutate({
        items,
        origin: window.location.origin,
        fulfillmentType,
        specialInstructions: specialInstructions || undefined,
        coinsToApply: effectiveCoinsToUse,
        scheduledFor: scheduledFor || undefined,
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
                  {/* Show original (full-price) subtotal so the discount math is visible */}
                  {/* Coin-grace mode banner — member cancelled but is using up
                      remaining coins before grace ends. No 10% discount applies. */}
                  {!isClubMember && inCoinGrace && (
                    <Alert className="border-orange-300 bg-orange-50">
                      <AlertDescription className="text-xs text-orange-900">
                        <strong>Discount paused — coin redemption only.</strong> You cancelled your FÜDA Club subscription. You can still spend remaining coins {coinGraceUntil ? <>until <strong>{coinGraceUntil.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</strong></> : "for a short window"}, but the 10% member discount no longer applies.
                      </AlertDescription>
                    </Alert>
                  )}
                  {(memberDiscountSavings > 0 || coinDiscountSavings > 0) && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Items at full price</span>
                      <span>
                        ${((subtotal + memberDiscountSavings + coinDiscountSavings) / 100).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {/* Member's choice — how many FÜDA Coins to spend on this order.
                      Shown for any member (active OR coin-grace) who has any coins
                      available AND at least one eligible (non-Mix-Grill) cart item. */}
                  {canOrderAsClub && coinBalance > 0 && eligibleUnitCount > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-amber-900">FÜDA Coins to use</p>
                          <p className="text-[11px] text-amber-900/70">
                            Each coin covers your highest-value eligible item. You have <strong>{coinBalance}</strong>.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCoinsToUse(Math.max(0, effectiveCoinsToUse - 1))}
                            className="h-7 w-7 rounded border border-amber-300 bg-white text-amber-900 font-bold hover:bg-amber-100 disabled:opacity-40"
                            disabled={effectiveCoinsToUse <= 0}
                            aria-label="Use one fewer coin"
                          >−</button>
                          <span className="min-w-[1.5rem] text-center font-bold text-amber-900">
                            {effectiveCoinsToUse}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCoinsToUse(Math.min(maxCoinsSpendable, effectiveCoinsToUse + 1))}
                            className="h-7 w-7 rounded border border-amber-300 bg-white text-amber-900 font-bold hover:bg-amber-100 disabled:opacity-40"
                            disabled={effectiveCoinsToUse >= maxCoinsSpendable}
                            aria-label="Use one more coin"
                          >+</button>
                        </div>
                      </div>
                      {eligibleUnitCount < coinBalance && (
                        <p className="text-[11px] text-amber-900/70">
                          Mix Grill items aren't coin-eligible — you can spend up to {maxCoinsSpendable} coin{maxCoinsSpendable === 1 ? "" : "s"} on this order.
                        </p>
                      )}
                    </div>
                  )}

                  {coinDiscountSavings > 0 && (
                    <div className="flex justify-between text-sm text-amber-700">
                      <span>
                        {isClubMember
                          ? `FÜDA Coin${effectiveCoinsToUse > 1 ? "s" : ""} (${effectiveCoinsToUse} item${effectiveCoinsToUse > 1 ? "s" : ""} free)`
                          : "Daily Credit"}
                      </span>
                      <span>-${(coinDiscountSavings / 100).toFixed(2)}</span>
                    </div>
                  )}
                  {memberDiscountSavings > 0 && (
                    <div className="flex justify-between text-sm text-amber-700">
                      <span>FÜDA Club discount (10% off)</span>
                      <span>-${(memberDiscountSavings / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>${(subtotal / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{isPickup ? "Pickup" : "Delivery Fee"}</span>
                    <span className={(isPickup || isFreeDelivery) ? "text-secondary" : ""}>
                      {isPickup ? "FREE" : isFreeDelivery ? "FREE" : `$${(deliveryFee / 100).toFixed(2)}`}
                    </span>
                  </div>
                  {!isClubMember && (
                    <div className="flex justify-between text-sm">
                      <span>Tax (10%)</span>
                      <span>${(tax / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className={isZeroTotal ? "text-secondary" : ""}>
                      {isZeroTotal ? "FREE" : `$${(total / 100).toFixed(2)}`}
                    </span>
                  </div>
                  {isClubMember && (
                    <p className="text-[11px] text-muted-foreground text-right">
                      Prices include GST
                    </p>
                  )}
                </div>

                {hasDailyCredit && !isClubMember && (
                  <Alert className="border-secondary/50 bg-secondary/10">
                    <CheckCircle2 className="h-4 w-4 text-secondary" />
                    <AlertDescription className="text-sm">
                      Daily credit applied to first item
                    </AlertDescription>
                  </Alert>
                )}
                {isClubMember && (memberDiscountSavings > 0 || coinDiscountSavings > 0) && (
                  <Alert className="border-amber-300 bg-amber-50">
                    <CheckCircle2 className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-sm text-amber-900">
                      You're saving <strong>${((memberDiscountSavings + coinDiscountSavings) / 100).toFixed(2)}</strong> as a FÜDA Club member.
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
