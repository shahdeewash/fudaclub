import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { ShoppingCart, Users, Star, Truck, Clock, LogOut } from "lucide-react";
import { CartIndicator } from "@/components/CartIndicator";
import { ModifierDialog, type ModifierSelection } from "@/components/ModifierDialog";
import { toast } from "sonner";

export default function Menu() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [cart, setCart] = useState<Map<number, number>>(new Map());
  const [cartModifiers, setCartModifiers] = useState<Map<number, { selections: ModifierSelection; extraCents: number }>>(new Map());
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [modifierDialogItem, setModifierDialogItem] = useState<{ id: number; name: string; price: number } | null>(null);

  const { data: menuItems, isLoading: menuLoading } = trpc.menu.getAll.useQuery();
  const { data: todaysSpecial } = trpc.menu.getTodaysSpecial.useQuery();
  const { data: subscription } = trpc.subscription.getMine.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  // FÜDA Club personal subscription — separate from the corporate B2B `subscription` above.
  // Members get a daily FÜDA Coin and 10% off every order. Non-members can still browse the menu.
  const { data: clubStatus } = trpc.fudaClub.getStatus.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const isClubMember = !!(clubStatus?.subscription && clubStatus.subscription.status !== "canceled");

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

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Logged out successfully");
      window.location.href = "/";
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

  // Menu is browsable by anyone authenticated — corporate members, FÜDA Club members,
  // and signed-in non-members alike. Member benefits (coin, 10% off) apply at checkout.
  // Non-members see a soft prompt to join the Club but can still view and order.

  const saveCartToLocalStorage = (cartMap: Map<number, number>, modMap?: Map<number, { selections: ModifierSelection; extraCents: number }>) => {
    const modsToUse = modMap ?? cartModifiers;
    const cartItems = Array.from(cartMap.entries()).map(([id, quantity]) => {
      const item = menuItems?.find(m => m.id === id) || todaysSpecial;
      const modInfo = modsToUse.get(id);
      const selectedMods = modInfo ? Object.values(modInfo.selections).flat() : [];
      const modNote = selectedMods.length > 0 ? selectedMods.map(m => m.name).join(", ") : undefined;
      return item ? {
        id: item.id,
        name: item.name,
        price: item.price + (modInfo?.extraCents ?? 0),
        quantity,
        imageUrl: item.imageUrl,
        modNote,
        selectedModifiers: selectedMods,
      } : null;
    }).filter(Boolean);
    
    localStorage.setItem("fuda_cart", JSON.stringify(cartItems));
    window.dispatchEvent(new Event("cartUpdated"));
  };

  const addToCartDirect = (itemId: number) => {
    const newCart = new Map(cart);
    newCart.set(itemId, (newCart.get(itemId) || 0) + 1);
    setCart(newCart);
    saveCartToLocalStorage(newCart);
  };

  const handleAddToCart = (item: { id: number; name: string; price: number }) => {
    // Open modifier dialog — it will call addToCartWithModifiers on confirm
    setModifierDialogItem(item);
  };

  const addToCartWithModifiers = (itemId: number, selections: ModifierSelection, extraCents: number) => {
    const newCart = new Map(cart);
    newCart.set(itemId, (newCart.get(itemId) || 0) + 1);
    const newMods = new Map(cartModifiers);
    newMods.set(itemId, { selections, extraCents });
    setCart(newCart);
    setCartModifiers(newMods);
    saveCartToLocalStorage(newCart, newMods);
    toast.success("Added to cart");
  };

  const removeFromCart = (itemId: number) => {
    const newCart = new Map(cart);
    const current = newCart.get(itemId) || 0;
    if (current <= 1) {
      newCart.delete(itemId);
      const newMods = new Map(cartModifiers);
      newMods.delete(itemId);
      setCartModifiers(newMods);
    } else {
      newCart.set(itemId, current - 1);
    }
    setCart(newCart);
    saveCartToLocalStorage(newCart);
  };

  const handleCheckout = () => {
    if (cart.size === 0) {
      toast.error("Cart is empty");
      return;
    }

    // Save cart to localStorage for checkout page (with modifier notes)
    const cartItems = Array.from(cart.entries()).map(([id, quantity]) => {
      const item = menuItems?.find(m => m.id === id) || todaysSpecial;
      const modInfo = cartModifiers.get(id);
      const selectedMods = modInfo ? Object.values(modInfo.selections).flat() : [];
      const modifierNote = selectedMods.length > 0 ? selectedMods.map(m => m.name).join(", ") : undefined;
      return item ? {
        id: item.id,
        name: item.name,
        price: item.price + (modInfo?.extraCents ?? 0),
        quantity,
        imageUrl: item.imageUrl,
        modifierNote,
      } : null;
    }).filter(Boolean);

    localStorage.setItem("fuda_cart", JSON.stringify(cartItems));
    window.dispatchEvent(new Event("cartUpdated"));
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
            <h1 className="text-xl font-bold">FÜDA · Daily Lunch</h1>
            <p className="text-xs opacity-90">Order before 10:30 AM</p>
          </div>
          <div className="flex gap-2">
            <CartIndicator />
            <Button variant="secondary" size="sm" onClick={() => setLocation("/orders")}>
              My Orders
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

      <main className="container py-6 max-w-6xl">
        {/* FÜDA Club status banner — shows for everyone, content varies by membership */}
        {isClubMember ? (
          <Alert className="mb-6 border-amber-300 bg-amber-50">
            <Star className="h-4 w-4 text-amber-600 fill-amber-400" />
            <AlertTitle className="text-amber-800">FÜDA Club Member · 10% off every order</AlertTitle>
            <AlertDescription className="text-amber-900/80">
              Your daily FÜDA Coin covers one item free, and every other item is 10% off — applied automatically at checkout.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="mb-6 border-amber-200 bg-amber-50/50">
            <Star className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-800">Save with The FÜDA Club</AlertTitle>
            <AlertDescription className="text-amber-900/80 flex items-center justify-between gap-3 flex-wrap">
              <span>Members get 1 FÜDA Coin daily (a free item) plus 10% off every order.</span>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-800 hover:bg-amber-100"
                onClick={() => setLocation("/fuda-club")}
              >
                Join the Club
              </Button>
            </AlertDescription>
          </Alert>
        )}

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
                      ${(todaysSpecial.price / 100).toFixed(2)}
                    </span>
                    <Button onClick={() => handleAddToCart({ id: todaysSpecial.id, name: todaysSpecial.name, price: todaysSpecial.price })} variant="secondary">
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
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-2xl font-bold">Menu</h2>
            {/* Category Filters */}
            {!menuLoading && menuItems && menuItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {["All", ...Array.from(new Set(menuItems.map(i => i.category).filter(Boolean)))].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat as string)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
          {menuLoading ? (
            <div className="text-center py-12">Loading menu...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {menuItems?.filter(item => selectedCategory === "All" || item.category === selectedCategory).map((item) => {
                const inCart = cart.get(item.id) || 0;

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
                          ${(item.price / 100).toFixed(2)}
                        </span>
                      </div>
                      <CardDescription className="text-sm">
                        {item.description}
                      </CardDescription>
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
                            onClick={() => handleAddToCart({ id: item.id, name: item.name, price: item.price })}
                            className="flex-1"
                          >
                            +
                          </Button>
                        </>
                      ) : (
                        <Button onClick={() => handleAddToCart({ id: item.id, name: item.name, price: item.price })} className="w-full">
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

      {/* Modifier Selection Dialog */}
      {modifierDialogItem && (
        <ModifierDialog
          open={!!modifierDialogItem}
          onClose={() => setModifierDialogItem(null)}
          menuItemId={modifierDialogItem.id}
          menuItemName={modifierDialogItem.name}
          menuItemPrice={modifierDialogItem.price}
          onConfirm={(selections, extraCents) =>
            addToCartWithModifiers(modifierDialogItem.id, selections, extraCents)
          }
        />
      )}
    </div>
  );
}
