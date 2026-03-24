import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, CreditCard, Lock, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { CartIndicator } from "@/components/CartIndicator";
import { toast } from "sonner";

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

interface PaymentFormData {
  cardNumber: string;
  cardName: string;
  expiry: string;
  cvv: string;
}

export default function Payment() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);

  const [paymentForm, setPaymentForm] = useState<PaymentFormData>({
    cardNumber: "",
    cardName: "",
    expiry: "",
    cvv: "",
  });

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
      setIsProcessing(false);
      toast.error(error.message || "Failed to place order");
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

  // Calculate pricing
  const hasDailyCredit = dailyCredit?.available && !dailyCredit?.usedToday;

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

  const handlePlaceOrder = (totalAmount: number) => {
    const items = cartItems.map(item => ({
      menuItemId: item.id,
      quantity: item.quantity,
    }));

    setPaidAmount(totalAmount);
    createOrder.mutate({
      items,
      specialInstructions: specialInstructions || undefined,
    });
  };

  const handlePaymentSubmit = async () => {
    // Validate payment form
    if (!paymentForm.cardNumber.replace(/\s/g, "").match(/^\d{16}$/)) {
      toast.error("Please enter a valid 16-digit card number");
      return;
    }
    if (!paymentForm.cardName.trim()) {
      toast.error("Please enter the cardholder name");
      return;
    }
    if (!paymentForm.expiry.match(/^\d{2}\/\d{2}$/)) {
      toast.error("Please enter expiry in MM/YY format");
      return;
    }
    if (!paymentForm.cvv.match(/^\d{3,4}$/)) {
      toast.error("Please enter a valid CVV");
      return;
    }

    setIsProcessing(true);
    toast.info("Processing payment...");

    // Simulate payment processing (2 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Place order after successful payment
    handlePlaceOrder(total);
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})/g, "$1 ").trim();
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 2) {
      return digits.slice(0, 2) + "/" + digits.slice(2);
    }
    return digits;
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
            {!isZeroTotal && (
              <Alert className="border-green-500/50 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Payment of ${(paidAmount / 100).toFixed(2)} processed successfully
                </AlertDescription>
              </Alert>
            )}
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
              {isZeroTotal ? "Your order is fully covered by daily credit" : "Secure payment"}
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
          {/* Payment Form or Zero Total */}
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
                    onClick={() => handlePlaceOrder(0)}
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
                      <>
                        <CheckCircle2 className="mr-2 h-5 w-5" />
                        Place Order (Free)
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            ) : (
              /* Payment Form */
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Payment Details
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Secured with 256-bit encryption
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="card-number">Card Number</Label>
                    <Input
                      id="card-number"
                      placeholder="1234 5678 9012 3456"
                      value={paymentForm.cardNumber}
                      onChange={(e) => setPaymentForm(prev => ({
                        ...prev,
                        cardNumber: formatCardNumber(e.target.value)
                      }))}
                      maxLength={19}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card-name">Cardholder Name</Label>
                    <Input
                      id="card-name"
                      placeholder="John Smith"
                      value={paymentForm.cardName}
                      onChange={(e) => setPaymentForm(prev => ({
                        ...prev,
                        cardName: e.target.value
                      }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="expiry">Expiry Date</Label>
                      <Input
                        id="expiry"
                        placeholder="MM/YY"
                        value={paymentForm.expiry}
                        onChange={(e) => setPaymentForm(prev => ({
                          ...prev,
                          expiry: formatExpiry(e.target.value)
                        }))}
                        maxLength={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cvv">CVV</Label>
                      <Input
                        id="cvv"
                        placeholder="123"
                        type="password"
                        value={paymentForm.cvv}
                        onChange={(e) => setPaymentForm(prev => ({
                          ...prev,
                          cvv: e.target.value.replace(/\D/g, "").slice(0, 4)
                        }))}
                        maxLength={4}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    <span>Your payment information is encrypted and secure</span>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={handlePaymentSubmit}
                    className="w-full"
                    size="lg"
                    disabled={isProcessing || createOrder.isPending}
                  >
                    {isProcessing || createOrder.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        {isProcessing ? "Processing Payment..." : "Placing Order..."}
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 h-5 w-5" />
                        Pay ${(total / 100).toFixed(2)} & Place Order
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
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>{item.quantity}x {item.name}</span>
                      <span>${(item.price * item.quantity / 100).toFixed(2)}</span>
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

            {/* Accepted Cards */}
            {!isZeroTotal && (
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground text-center">
                    <p className="font-medium mb-2">Accepted Payment Methods</p>
                    <div className="flex justify-center gap-3">
                      <Badge variant="outline" className="text-xs">VISA</Badge>
                      <Badge variant="outline" className="text-xs">Mastercard</Badge>
                      <Badge variant="outline" className="text-xs">AMEX</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
