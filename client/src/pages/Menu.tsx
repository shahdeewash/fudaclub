import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { ShoppingCart, Users, Truck, Clock, Star } from "lucide-react";
import { toast } from "sonner";

export default function Menu() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [cart, setCart] = useState<Map<number, number>>(new Map());

  const { data: menuItems, isLoading: menuLoading } = trpc.menu.getAll.useQuery();
  const { data: todaysSpecial } = trpc.menu.getTodaysSpecial.useQuery();
  const { data: subscription } = trpc.subscription.getMine.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: colleagues } = trpc.order.getColleaguesWhoOrdered.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: dailyCredit } = trpc.order.getDailyCredit.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const utils = trpc.useUtils();
  const createOrder = trpc.order.create.useMutation({
    onSuccess: () => {
      toast.success("Order placed successfully!");
      setCart(new Map());
      utils.order.getColleaguesWhoOrdered.invalidate();
      setLocation("/orders");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Login Required</CardTitle>
            <CardDescription>Please login to access the menu</CardDescription>
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

  if (!subscription) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Subscription Required</CardTitle>
            <CardDescription>Subscribe to access corporate lunch deals</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/subscribe")} className="w-full">
              Subscribe Now
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const addToCart = (itemId: number) => {
    setCart(new Map(cart.set(itemId, (cart.get(itemId) || 0) + 1)));
  };

  const removeFromCart = (itemId: number) => {
    const newCart = new Map(cart);
    const current = newCart.get(itemId) || 0;
    if (current <= 1) {
      newCart.delete(itemId);
    } else {
      newCart.set(itemId, current - 1);
    }
    setCart(newCart);
  };

  const handleCheckout = () => {
    if (cart.size === 0) {
      toast.error("Cart is empty");
      return;
    }

    // Save cart to localStorage for checkout page
    const cartItems = Array.from(cart.entries()).map(([id, quantity]) => {
      const item = menuItems?.find(m => m.id === id) || todaysSpecial;
      return item ? {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity,
        imageUrl: item.imageUrl,
      } : null;
    }).filter(Boolean);

    localStorage.setItem("fuda_cart", JSON.stringify(cartItems));
    setLocation("/checkout");
  };

  const cartTotal = cart.size;
  const colleagueCount = colleagues?.length || 0;
  const deliveryThreshold = 5;
  const deliveryProgress = Math.min((colleagueCount / deliveryThreshold) * 100, 100);
  const freeDeliveryUnlocked = colleagueCount >= deliveryThreshold;

  // Check if daily credit is available
  const hasDailyCredit = dailyCredit?.available || false;
  const hasUsedCreditToday = dailyCredit?.usedToday || false;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-4 shadow-md sticky top-0 z-10">
        <div className="container flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">FÜDA Corporate Lunch</h1>
            <p className="text-xs opacity-90">Order before 10:30 AM</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setLocation("/orders")}>
            My Orders
          </Button>
        </div>
      </header>

      <main className="container py-6 max-w-6xl">
        {/* Colleague Banner */}
        {colleagueCount > 0 && (
          <Alert className="mb-6 border-secondary/50 bg-secondary/10">
            <Users className="h-4 w-4 text-secondary" />
            <AlertTitle className="text-secondary">
              {colleagueCount} {colleagueCount === 1 ? "colleague has" : "colleagues have"} ordered today!
            </AlertTitle>
            <AlertDescription>
              {colleagues?.map(c => c.name).join(", ")}
            </AlertDescription>
          </Alert>
        )}

        {/* Delivery Progress */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Truck className={freeDeliveryUnlocked ? "text-secondary" : "text-muted-foreground"} />
                <span className="font-semibold">
                  {freeDeliveryUnlocked ? "Free Delivery Unlocked!" : `${deliveryThreshold - colleagueCount} more for free delivery`}
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                {colleagueCount}/{deliveryThreshold}
              </span>
            </div>
            <Progress value={deliveryProgress} className="h-2" />
          </CardContent>
        </Card>

        {/* Cutoff Warning */}
        <Alert className="mb-6">
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Orders placed after 10:30 AM will be marked for <strong>store pickup only</strong>
          </AlertDescription>
        </Alert>

        {/* Today's Special */}
        {todaysSpecial && (
          <Card className="mb-8 border-secondary">
            <CardHeader className="bg-secondary/10">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-secondary fill-secondary" />
                <CardTitle>Today's Special</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <img
                  src={todaysSpecial.imageUrl || ""}
                  alt={todaysSpecial.name}
                  className="w-32 h-32 object-cover rounded-lg"
                />
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-1">{todaysSpecial.name}</h3>
                  <p className="text-muted-foreground mb-3">{todaysSpecial.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {hasDailyCredit && !hasUsedCreditToday && cart.size === 0 ? (
                        <span className="text-secondary">$0.00</span>
                      ) : (
                        `$${(todaysSpecial.price / 100).toFixed(2)}`
                      )}
                    </span>
                    <Button onClick={() => addToCart(todaysSpecial.id)} variant="secondary">
                      Add to Cart
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Menu Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Menu</h2>
          {menuLoading ? (
            <div className="text-center py-12">Loading menu...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {menuItems?.map((item) => {
                const inCart = cart.get(item.id) || 0;
                const isFirstItemInCart = cart.size === 0;
                const isFree = hasDailyCredit && !hasUsedCreditToday && isFirstItemInCart;

                return (
                  <Card key={item.id}>
                    <CardHeader className="p-0">
                      <img
                        src={item.imageUrl || ""}
                        alt={item.name}
                        className="w-full h-48 object-cover rounded-t-lg"
                      />
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <CardTitle className="text-lg">{item.name}</CardTitle>
                          {item.category && (
                            <Badge variant="outline" className="mt-1">
                              {item.category}
                            </Badge>
                          )}
                        </div>
                        <span className="text-lg font-bold">
                          {isFree ? (
                            <span className="text-secondary">$0.00</span>
                          ) : (
                            `$${(item.price / 100).toFixed(2)}`
                          )}
                        </span>
                      </div>
                      <CardDescription className="text-sm">
                        {item.description}
                      </CardDescription>
                      {isFree && (
                        <Badge variant="secondary" className="mt-2">
                          Daily Credit Available
                        </Badge>
                      )}
                    </CardContent>
                    <CardFooter className="flex gap-2">
                      {inCart > 0 ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeFromCart(item.id)}
                            className="flex-1"
                          >
                            -
                          </Button>
                          <span className="px-4 py-2 font-semibold">{inCart}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addToCart(item.id)}
                            className="flex-1"
                          >
                            +
                          </Button>
                        </>
                      ) : (
                        <Button onClick={() => addToCart(item.id)} className="w-full">
                          Add to Cart
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Cart */}
        {cartTotal > 0 && (
          <div className="fixed bottom-6 right-6 z-20">
            <Button
              size="lg"
              onClick={handleCheckout}
              disabled={createOrder.isPending}
              className="shadow-lg"
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              Checkout ({cartTotal} {cartTotal === 1 ? "item" : "items"})
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
