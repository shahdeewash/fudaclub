import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Package, Truck, Clock } from "lucide-react";
import { toast } from "sonner";

type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "canceled";

export default function Kitchen() {
  const { user, isAuthenticated } = useAuth();

  const { data: orders, isLoading } = trpc.order.getTodayOrders.useQuery(undefined, {
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "kitchen"),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const utils = trpc.useUtils();
  const updateStatus = trpc.order.updateStatus.useMutation({
    onSuccess: () => {
      utils.order.getTodayOrders.invalidate();
      toast.success("Order status updated");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (!isAuthenticated || (user?.role !== "admin" && user?.role !== "kitchen")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Kitchen or admin access required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleStatusChange = (orderId: number, newStatus: OrderStatus) => {
    updateStatus.mutate({ orderId, status: newStatus });
  };

  // Group orders by status
  const ordersByStatus = {
    pending: orders?.filter((o) => o.status === "pending") || [],
    preparing: orders?.filter((o) => o.status === "preparing") || [],
    ready: orders?.filter((o) => o.status === "ready") || [],
  };

  // Group orders by company for batch preparation (currently unused but available for future features)
  // const ordersByCompany = new Map<number, typeof orders>();
  // orders?.forEach((order) => {
  //   if (!ordersByCompany.has(order.companyId)) {
  //     ordersByCompany.set(order.companyId, []);
  //   }
  //   ordersByCompany.get(order.companyId)!.push(order);
  // });

  const OrderCard = ({ order }: { order: NonNullable<typeof orders>[number] }) => {
    const nextStatus: Record<OrderStatus, OrderStatus | null> = {
      pending: "preparing",
      confirmed: "preparing",
      preparing: "ready",
      ready: "delivered",
      delivered: null,
      canceled: null,
    };

    const next = nextStatus[order.status];

    return (
      <Card className="mb-3">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg font-mono">{order.orderNumber}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                {order.fulfillmentType === "delivery" ? (
                  <Badge variant="secondary" className="text-xs">
                    <Truck className="h-3 w-3 mr-1" />
                    {order.isFreeDelivery ? "Free Delivery" : "Delivery"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <Package className="h-3 w-3 mr-1" />
                    Pickup
                  </Badge>
                )}
                {order.dailyCreditUsed && (
                  <Badge variant="outline" className="text-xs">
                    Credit Used
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">
                {new Date(order.orderDate).toLocaleTimeString("en-AU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Company Batch Tag */}
          <div className="p-2 bg-primary/10 rounded-md">
            <span className="text-xs font-semibold text-primary">
              BATCH: COMPANY-{order.companyId}
            </span>
          </div>

          {/* Order Items */}
          {(order as any).items && (order as any).items.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground mb-1">Items:</div>
              {(order as any).items.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-semibold">{item.quantity}x</span> {item.itemName}
                    {item.isFree && <Badge variant="secondary" className="ml-2 text-xs">Free</Badge>}
                  </span>
                  <span className="text-muted-foreground">${(item.totalPrice / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-bold">${(order.total / 100).toFixed(2)}</span>
          </div>

          {/* Action Button */}
          {next && (
            <Button
              onClick={() => handleStatusChange(order.id, next)}
              disabled={updateStatus.isPending}
              className="w-full"
              size="sm"
            >
              Mark as {next.charAt(0).toUpperCase() + next.slice(1)}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-4 shadow-md sticky top-0 z-10">
        <div className="container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Kitchen Display</h1>
              <p className="text-sm opacity-90">FÜDA Corporate Lunch</p>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span className="text-lg font-mono">
                {new Date().toLocaleTimeString("en-AU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-7xl">
        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">
                  {ordersByStatus.pending.length}
                </div>
                <div className="text-sm text-muted-foreground">Pending</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">
                  {ordersByStatus.preparing.length}
                </div>
                <div className="text-sm text-muted-foreground">Preparing</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {ordersByStatus.ready.length}
                </div>
                <div className="text-sm text-muted-foreground">Ready</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Kanban Board */}
        {isLoading ? (
          <div className="text-center py-12">Loading orders...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Pending Column */}
            <div>
              <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-t-lg font-semibold">
                Pending ({ordersByStatus.pending.length})
              </div>
              <div className="bg-yellow-50 p-4 rounded-b-lg min-h-[400px]">
                {ordersByStatus.pending.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
                {ordersByStatus.pending.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No pending orders
                  </div>
                )}
              </div>
            </div>

            {/* Preparing Column */}
            <div>
              <div className="bg-purple-100 text-purple-800 px-4 py-2 rounded-t-lg font-semibold">
                Preparing ({ordersByStatus.preparing.length})
              </div>
              <div className="bg-purple-50 p-4 rounded-b-lg min-h-[400px]">
                {ordersByStatus.preparing.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
                {ordersByStatus.preparing.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No orders in preparation
                  </div>
                )}
              </div>
            </div>

            {/* Ready Column */}
            <div>
              <div className="bg-green-100 text-green-800 px-4 py-2 rounded-t-lg font-semibold">
                Ready ({ordersByStatus.ready.length})
              </div>
              <div className="bg-green-50 p-4 rounded-b-lg min-h-[400px]">
                {ordersByStatus.ready.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
                {ordersByStatus.ready.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No orders ready
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
