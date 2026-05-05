import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthGate } from "@/components/AuthGate";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Package, Truck, LogOut, CreditCard, ExternalLink, CheckCircle2, MapPin, Loader2 } from "lucide-react";
import { CartIndicator } from "@/components/CartIndicator";
import { useState } from "react";
import { toast } from "sonner";

// Sub-component to lazily fetch and show payment details for a single order
function PaymentDetailsBadge({ orderId, stripeSessionId }: { orderId: number; stripeSessionId?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = trpc.payment.getPaymentDetails.useQuery(
    { orderId },
    { enabled: expanded }
  );

  if (!stripeSessionId) {
    return (
      <div className="flex items-center gap-1 text-xs text-secondary font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Free (Daily Credit)
      </div>
    );
  }

  return (
    <div className="text-xs">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <CreditCard className="h-3.5 w-3.5" />
          Paid via Stripe — view receipt
        </button>
      ) : isLoading ? (
        <span className="text-muted-foreground">Loading payment info...</span>
      ) : data ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-green-700 font-medium">
            <CreditCard className="h-3.5 w-3.5" />
            ${(data.amountPaid / 100).toFixed(2)} {data.currency.toUpperCase()} · {data.status}
          </span>
          {data.receiptUrl && (
            <a
              href={data.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary underline hover:no-underline"
            >
              <ExternalLink className="h-3 w-3" />
              View Receipt
            </a>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function Orders() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const { data: orders, isLoading } = trpc.order.getMyOrders.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const utils = trpc.useUtils();

  const markArrived = trpc.stats.markArrived.useMutation({
    onSuccess: (data) => {
      toast.success(`Checked in! Kitchen notified for order ${data.orderNumber}.`);
      utils.order.getMyOrders.invalidate();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to check in");
    },
  });

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  if (!isAuthenticated) {
    return <AuthGate reason="Please log in to see your orders." />;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "confirmed":
        return "bg-blue-100 text-blue-800";
      case "preparing":
        return "bg-purple-100 text-purple-800";
      case "ready":
        return "bg-green-100 text-green-800";
      case "delivered":
        return "bg-gray-100 text-gray-800";
      case "arrived":
        return "bg-orange-100 text-orange-800";
      case "canceled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-4 shadow-md">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/menu")}
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Menu
            </Button>
            <h1 className="text-xl font-bold">My Orders</h1>
          </div>
          <div className="flex gap-2">
            <CartIndicator />
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

      <main className="container py-6 max-w-4xl">
        {isLoading ? (
          <div className="text-center py-12">Loading orders...</div>
        ) : orders && orders.length > 0 ? (
          <div className="space-y-4">
            {orders.map((order) => (
              <Card key={order.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">Order {order.orderNumber}</CardTitle>
                      <CardDescription>
                        {new Date(order.orderDate).toLocaleDateString("en-AU", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </CardDescription>
                    </div>
                    <Badge className={getStatusColor(order.status)}>
                      {order.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Fulfillment Type */}
                    <div className="flex items-center gap-2 text-sm">
                      {order.fulfillmentType === "delivery" ? (
                        <>
                          <Truck className="h-4 w-4 text-secondary" />
                          <span className="font-medium">
                            {order.isFreeDelivery ? "Free Delivery" : "Delivery ($8.00)"}
                          </span>
                        </>
                      ) : (
                        <>
                          <Package className="h-4 w-4" />
                          <span className="font-medium">Store Pickup</span>
                        </>
                      )}
                    </div>

                    {/* Daily Credit Used */}
                    {order.dailyCreditUsed && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="secondary">Daily Credit Used</Badge>
                      </div>
                    )}

                    {/* Pricing */}
                    <div className="border-t pt-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${(order.subtotal / 100).toFixed(2)}</span>
                      </div>
                      {order.deliveryFee > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Delivery Fee</span>
                          <span>${(order.deliveryFee / 100).toFixed(2)}</span>
                        </div>
                      )}
                      {order.tax > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Tax (10%)</span>
                          <span>${(order.tax / 100).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-lg pt-2 border-t">
                        <span>Total</span>
                        <span>${(order.total / 100).toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Payment Details */}
                    <div className="border-t pt-3">
                      <PaymentDetailsBadge orderId={order.id} stripeSessionId={(order as any).stripeSessionId} />
                    </div>

                    {/* Special Instructions */}
                    {order.specialInstructions && (
                      <div className="text-sm">
                        <span className="font-medium">Special Instructions:</span>
                        <p className="text-muted-foreground mt-1">{order.specialInstructions}</p>
                      </div>
                    )}

                    {/* I'm Here button for confirmed pickup orders */}
                    {(order.status === "confirmed" || order.status === "pending") && order.fulfillmentType === "pickup" && (
                      <div className="border-t pt-3">
                        <Button
                          onClick={() => markArrived.mutate({ orderId: order.id })}
                          disabled={markArrived.isPending}
                          className="w-full"
                          variant="default"
                          size="sm"
                        >
                          {markArrived.isPending ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Notifying kitchen...</>
                          ) : (
                            <><MapPin className="mr-2 h-4 w-4" />I'm Here — Start My Order</>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center mt-1">
                          Tap when you arrive at the pickup point
                        </p>
                      </div>
                    )}

                    {/* Arrived confirmation */}
                    {order.status === "arrived" && (
                      <div className="border-t pt-3">
                        <div className="rounded-md bg-orange-50 border border-orange-200 p-3 text-center">
                          <MapPin className="h-4 w-4 text-orange-600 mx-auto mb-1" />
                          <p className="text-sm font-medium text-orange-800">You're checked in!</p>
                          <p className="text-xs text-orange-600">Kitchen has been notified and will start preparing your order.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground mb-4">Start ordering from the menu</p>
              <Button onClick={() => setLocation("/menu")}>
                Browse Menu
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
