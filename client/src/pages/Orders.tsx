import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Package, Truck, LogOut } from "lucide-react";
import { CartIndicator } from "@/components/CartIndicator";

export default function Orders() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const { data: orders, isLoading } = trpc.order.getMyOrders.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Login Required</CardTitle>
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

                    {/* Special Instructions */}
                    {order.specialInstructions && (
                      <div className="text-sm">
                        <span className="font-medium">Special Instructions:</span>
                        <p className="text-muted-foreground mt-1">{order.specialInstructions}</p>
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
