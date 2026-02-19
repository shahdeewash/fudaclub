import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Truck, MapPin, Clock, ArrowLeft, Loader2, LogOut } from "lucide-react";
import { CartIndicator } from "@/components/CartIndicator";
import { toast } from "sonner";

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

export default function Checkout() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");

  const { data: subscription } = trpc.subscription.getMine.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: dailyCredit } = trpc.order.getDailyCredit.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: colleagues } = trpc.order.getColleaguesWhoOrdered.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const utils = trpc.useUtils();
  const createOrder = trpc.order.create.useMutation({
    onSuccess: (data) => {
      setOrderPlaced(true);
      setOrderNumber(data.order.orderNumber);
      toast.success("Order placed successfully!");
      utils.order.getColleaguesWhoOrdered.invalidate();
      utils.order.getDailyCredit.invalidate();
      
      // Clear cart from localStorage
      localStorage.removeItem("fuda_cart");
      window.dispatchEvent(new Event("cartUpdated"));
      
      // Redirect to orders page after 3 seconds
      setTimeout(() => {
        setLocation("/orders");
      }, 3000);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to place order");
    },
  });

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Logged out successfully");
      window.location.href = "/";
    },
  });

  // Load cart from localStorage on mount
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
  }, []);

  if (!isAuthenticated || !subscription) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Please login and subscribe to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/")} className="w-full">
              Go Home
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
            <CardDescription>Add items to your cart before checking out</CardDescription>
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

  const handlePlaceOrder = () => {
    const items = cartItems.map(item => ({
      menuItemId: item.id,
      quantity: item.quantity,
    }));

    createOrder.mutate({
      items,
      specialInstructions: specialInstructions || undefined,
    });
  };

  // Calculate pricing
  const hasDailyCredit = dailyCredit?.available && !dailyCredit?.usedToday;
  
  // Calculate subtotal with daily credit applied to first unit only
  let subtotal = 0;
  if (hasDailyCredit && cartItems.length > 0) {
    // First item: one unit is free, remaining units are charged
    const firstItem = cartItems[0];
    const firstItemTotal = firstItem.price * (firstItem.quantity - 1); // quantity - 1 because first unit is free
    subtotal += firstItemTotal;
    
    // Remaining items: all units are charged
    const otherItemsTotal = cartItems.slice(1).reduce((sum, item) => sum + (item.price * item.quantity), 0);
    subtotal += otherItemsTotal;
  } else {
    // No daily credit: charge for all items
    subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }
  
  const colleagueCount = colleagues?.length || 0;
  const deliveryThreshold = 5;
  const isFreeDelivery = colleagueCount >= deliveryThreshold;
  const deliveryFee = isFreeDelivery ? 0 : 800; // $8.00
  const tax = Math.round((subtotal + deliveryFee) * 0.1);
  const total = subtotal + deliveryFee + tax;

  const currentTime = new Date();
  const cutoffTime = new Date();
  cutoffTime.setHours(10, 30, 0, 0);
  const isBeforeCutoff = currentTime < cutoffTime;
  const fulfillmentType = isBeforeCutoff && isFreeDelivery ? "delivery" : "pickup";

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
              <AlertDescription className="text-center">
                <p className="font-semibold text-lg mb-2">
                  {fulfillmentType === "delivery" ? "🚚 Free Delivery" : "📍 Store Pickup"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {fulfillmentType === "delivery" 
                    ? "Your order will be delivered to your office"
                    : "Please collect your order from the store"}
                </p>
              </AlertDescription>
            </Alert>

            <div className="bg-muted p-6 rounded-lg space-y-3">
              <h3 className="font-semibold mb-3">What's Next:</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 flex-shrink-0" />
                  <span>Your order has been sent to the kitchen</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 flex-shrink-0" />
                  <span>Preparation will begin shortly</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5 flex-shrink-0" />
                  <span>
                    {fulfillmentType === "delivery" 
                      ? "Delivery expected around 12:30 PM"
                      : "Ready for pickup around 12:00 PM"}
                  </span>
                </div>
              </div>
            </div>

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
            <h1 className="text-xl font-bold">Checkout</h1>
            <p className="text-xs opacity-90">Review your order</p>
          </div>
          <div className="flex gap-2">
            <CartIndicator />
            <Button variant="secondary" size="sm" onClick={() => setLocation("/menu")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Menu
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {logout.isPending ? "Logging out..." : "Logout"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order Items */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Order Items</CardTitle>
                <CardDescription>{cartItems.length} {cartItems.length === 1 ? "item" : "items"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cartItems.map((item, index) => {
                  const isFree = hasDailyCredit && index === 0;
                  const itemTotal = isFree ? 0 : item.price * item.quantity;

                  return (
                    <div key={item.id} className="flex gap-4 pb-4 border-b last:border-0">
                      {item.imageUrl && item.imageUrl.trim() !== "" && (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-semibold">{item.name}</h3>
                          <span className="font-bold">
                            {isFree ? (
                              <span className="text-secondary">$0.00</span>
                            ) : (
                              `$${(itemTotal / 100).toFixed(2)}`
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Quantity: {item.quantity}</span>
                          {!isFree && (
                            <span>• ${(item.price / 100).toFixed(2)} each</span>
                          )}
                        </div>
                        {isFree && (
                          <Badge variant="secondary" className="mt-2">
                            Daily Credit Applied
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Special Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>Special Instructions</CardTitle>
                <CardDescription>Any dietary requirements or preferences?</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="E.g., No onions, extra spicy, etc."
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  rows={3}
                />
              </CardContent>
            </Card>
          </div>

          {/* Order Summary */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>${(subtotal / 100).toFixed(2)}</span>
                  </div>
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
                    <span>${(total / 100).toFixed(2)}</span>
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

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fulfillment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  {fulfillmentType === "delivery" ? (
                    <Truck className="h-5 w-5 text-secondary mt-0.5" />
                  ) : (
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {fulfillmentType === "delivery" ? "Delivery" : "Store Pickup"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {fulfillmentType === "delivery" 
                        ? "To your office address"
                        : "Collect from FÜDA Darwin"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {fulfillmentType === "delivery" ? "~12:30 PM" : "~12:00 PM"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Estimated {fulfillmentType === "delivery" ? "delivery" : "ready"} time
                    </p>
                  </div>
                </div>

                {!isBeforeCutoff && (
                  <Alert>
                    <AlertDescription className="text-sm">
                      Order placed after 10:30 AM - pickup only
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Button
              onClick={handlePlaceOrder}
              className="w-full"
              size="lg"
              disabled={createOrder.isPending}
            >
              {createOrder.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Placing Order...
                </>
              ) : (
                `Place Order • $${(total / 100).toFixed(2)}`
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
