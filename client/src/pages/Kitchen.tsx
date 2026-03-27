import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Package, Truck, Clock, History } from "lucide-react";
import { toast } from "sonner";

type OrderStatus = "pending" | "confirmed" | "arrived" | "preparing" | "ready" | "delivered" | "canceled";
type DateFilter = "today" | "yesterday" | "week" | "all";
type ViewMode = "kanban" | "list";

export default function Kitchen() {
  const { user, isAuthenticated } = useAuth();
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  const { data: orders, isLoading } = trpc.order.getAllOrders.useQuery(
    { dateFilter },
    {
      enabled: isAuthenticated && (user?.role === "admin" || user?.role === "kitchen"),
      refetchInterval: 5000,
    }
  );

  const utils = trpc.useUtils();
  const updateStatus = trpc.order.updateStatus.useMutation({
    onSuccess: () => {
      utils.order.getAllOrders.invalidate();
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

  // Group active orders by status for kanban view
  const activeOrders = orders?.filter(o => !["delivered", "canceled"].includes(o.status)) || [];
  const pastOrders = orders?.filter(o => ["delivered", "canceled"].includes(o.status)) || [];

  const ordersByStatus = {
    pending: activeOrders.filter((o) => o.status === "pending" || o.status === "confirmed"),
    arrived: activeOrders.filter((o) => o.status === "arrived"),
    preparing: activeOrders.filter((o) => o.status === "preparing"),
    ready: activeOrders.filter((o) => o.status === "ready"),
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    confirmed: "bg-yellow-100 text-yellow-800 border-yellow-200",
    arrived: "bg-orange-100 text-orange-800 border-orange-200",
    preparing: "bg-purple-100 text-purple-800 border-purple-200",
    ready: "bg-green-100 text-green-800 border-green-200",
    delivered: "bg-blue-100 text-blue-800 border-blue-200",
    canceled: "bg-red-100 text-red-800 border-red-200",
  };

  const OrderCard = ({ order }: { order: NonNullable<typeof orders>[number] }) => {
    const nextStatus: Record<OrderStatus, OrderStatus | null> = {
      pending: "preparing",
      confirmed: "preparing",
      arrived: "preparing",
      preparing: "ready",
      ready: "delivered",
      delivered: null,
      canceled: null,
    };

    const next = nextStatus[order.status as OrderStatus];
    const isPast = ["delivered", "canceled"].includes(order.status);

    return (
      <Card className={`mb-3 ${isPast ? "opacity-75" : ""}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg font-mono">{order.orderNumber}</CardTitle>
              <div className="text-xs text-muted-foreground mt-0.5">
                {(order as any).userName}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                  <Badge variant="outline" className="text-xs">Credit Used</Badge>
                )}
                <Badge className={`text-xs border ${statusColors[order.status] || ""}`} variant="outline">
                  {order.status}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">
                {new Date(order.orderDate).toLocaleDateString("en-AU", {
                  day: "2-digit",
                  month: "short",
                })}
              </div>
              <div className="text-xs text-muted-foreground">
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
                <div key={idx} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      <span className="font-semibold">{item.quantity}x</span> {item.itemName}
                      {item.isFree && <Badge variant="secondary" className="ml-2 text-xs">Free</Badge>}
                    </span>
                    <span className="text-muted-foreground">${(item.totalPrice / 100).toFixed(2)}</span>
                  </div>
                  {item.modifierNote && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 pl-4 font-medium">→ {item.modifierNote}</p>
                  )}
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
          {next && !isPast && (
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
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold">Kitchen Display</h1>
              <p className="text-sm opacity-90">FÜDA Corporate Lunch</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Date Filter */}
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                <SelectTrigger className="w-36 bg-primary-foreground/10 border-primary-foreground/30 text-primary-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="all">All Orders</SelectItem>
                </SelectContent>
              </Select>

              {/* View Toggle */}
              <div className="flex gap-1 bg-primary-foreground/10 rounded-md p-1">
                <Button
                  size="sm"
                  variant={viewMode === "kanban" ? "secondary" : "ghost"}
                  onClick={() => setViewMode("kanban")}
                  className="text-xs h-7"
                >
                  Kanban
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  onClick={() => setViewMode("list")}
                  className="text-xs h-7"
                >
                  <History className="h-3 w-3 mr-1" />
                  All
                </Button>
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
        </div>
      </header>

      <main className="container py-6 max-w-7xl">
        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
          <Card className={ordersByStatus.arrived.length > 0 ? "border-orange-400 ring-2 ring-orange-300" : ""}>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600">
                  {ordersByStatus.arrived.length}
                </div>
                <div className="text-sm text-muted-foreground">Arrived</div>
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
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {pastOrders.length}
                </div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="text-center py-12">Loading orders...</div>
        ) : viewMode === "kanban" ? (
          <>
            {/* Kanban Board - Active Orders */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {/* Pending Column */}
              <div>
                <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-t-lg font-semibold">
                  Pending ({ordersByStatus.pending.length})
                </div>
                <div className="bg-yellow-50 p-4 rounded-b-lg min-h-[300px]">
                  {ordersByStatus.pending.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                  {ordersByStatus.pending.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">No pending orders</div>
                  )}
                </div>
              </div>

              {/* Arrived Column */}
              <div>
                <div className={`px-4 py-2 rounded-t-lg font-semibold flex items-center gap-2 ${ordersByStatus.arrived.length > 0 ? "bg-orange-400 text-white" : "bg-orange-100 text-orange-800"}`}>
                  {ordersByStatus.arrived.length > 0 && <span className="animate-pulse h-2 w-2 rounded-full bg-white inline-block" />}
                  Customer Arrived ({ordersByStatus.arrived.length})
                </div>
                <div className="bg-orange-50 p-4 rounded-b-lg min-h-[300px]">
                  {ordersByStatus.arrived.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                  {ordersByStatus.arrived.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">No customers arrived yet</div>
                  )}
                </div>
              </div>

              {/* Preparing Column */}
              <div>
                <div className="bg-purple-100 text-purple-800 px-4 py-2 rounded-t-lg font-semibold">
                  Preparing ({ordersByStatus.preparing.length})
                </div>
                <div className="bg-purple-50 p-4 rounded-b-lg min-h-[300px]">
                  {ordersByStatus.preparing.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                  {ordersByStatus.preparing.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">No orders in preparation</div>
                  )}
                </div>
              </div>

              {/* Ready Column */}
              <div>
                <div className="bg-green-100 text-green-800 px-4 py-2 rounded-t-lg font-semibold">
                  Ready ({ordersByStatus.ready.length})
                </div>
                <div className="bg-green-50 p-4 rounded-b-lg min-h-[300px]">
                  {ordersByStatus.ready.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                  {ordersByStatus.ready.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">No orders ready</div>
                  )}
                </div>
              </div>
            </div>

            {/* Past Orders Section */}
            {pastOrders.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Past Orders ({pastOrders.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {pastOrders.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* List View - All Orders */
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">All Orders ({orders?.length || 0})</h2>
            {orders && orders.length > 0 ? (
              orders.map((order) => (
                <Card key={order.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-mono font-bold">{order.orderNumber}</span>
                          <Badge className={`text-xs border ${statusColors[order.status] || ""}`} variant="outline">
                            {order.status}
                          </Badge>
                          {order.fulfillmentType === "delivery" ? (
                            <Badge variant="secondary" className="text-xs">
                              <Truck className="h-3 w-3 mr-1" />
                              Delivery
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <Package className="h-3 w-3 mr-1" />
                              Pickup
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {(order as any).userName} · Company-{order.companyId}
                        </div>
                        {(order as any).items && (order as any).items.length > 0 && (
                          <div className="mt-2 text-sm">
                            {(order as any).items.map((item: any, idx: number) => (
                              <span key={idx} className="text-muted-foreground">
                                {idx > 0 && ", "}
                                {item.quantity}x {item.itemName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold">${(order.total / 100).toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(order.orderDate).toLocaleDateString("en-AU", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(order.orderDate).toLocaleTimeString("en-AU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        {!["delivered", "canceled"].includes(order.status) && (
                          <Button
                            size="sm"
                            className="mt-2 text-xs"
                            onClick={() => {
                              const nextStatus: Record<string, OrderStatus> = {
                                pending: "preparing",
                                confirmed: "preparing",
                                preparing: "ready",
                                ready: "delivered",
                              };
                              const next = nextStatus[order.status];
                              if (next) handleStatusChange(order.id, next);
                            }}
                            disabled={updateStatus.isPending}
                          >
                            Mark as {
                              ({ pending: "Preparing", confirmed: "Preparing", arrived: "Preparing", preparing: "Ready", ready: "Delivered", delivered: "", canceled: "" } as Record<string, string>)[order.status]
                            }
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No orders found for this period</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
