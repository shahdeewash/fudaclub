import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { BarChart3, DollarSign, Package, Users, Star, Plus } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Admin() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedSpecial, setSelectedSpecial] = useState<string>("");

  const { data: stats } = trpc.stats.getToday.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const { data: ordersByCompany } = trpc.stats.getOrdersByCompany.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const { data: menuItems } = trpc.menu.getAll.useQuery();
  const { data: todaysSpecial } = trpc.menu.getTodaysSpecial.useQuery();

  const utils = trpc.useUtils();
  const setSpecial = trpc.menu.setTodaysSpecial.useMutation({
    onSuccess: () => {
      toast.success("Today's special updated!");
      utils.menu.getTodaysSpecial.invalidate();
      setSelectedSpecial("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Admin access required</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSetSpecial = () => {
    if (!selectedSpecial) {
      toast.error("Please select a menu item");
      return;
    }
    setSpecial.mutate({ menuItemId: parseInt(selectedSpecial) });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-4 shadow-md">
        <div className="container">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm opacity-90">FÜDA Corporate Lunch Management</p>
        </div>
      </header>

      <main className="container py-6 max-w-7xl">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="companies">By Company</TabsTrigger>
            <TabsTrigger value="menu">Menu Management</TabsTrigger>
            <TabsTrigger value="specials">Today's Special</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.totalOrders || 0}</div>
                  <p className="text-xs text-muted-foreground">Today</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Companies</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.companiesOrdering || 0}</div>
                  <p className="text-xs text-muted-foreground">Ordering today</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Free Deliveries</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.freeDeliveries || 0}</div>
                  <p className="text-xs text-muted-foreground">5+ order threshold</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${((stats?.revenue || 0) / 100).toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground">Today's total</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Companies Tab */}
          <TabsContent value="companies" className="space-y-4">
            {ordersByCompany && ordersByCompany.length > 0 ? (
              ordersByCompany.map((group) => (
                <Card key={group.company.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{group.company.name}</CardTitle>
                        <CardDescription>
                          Domain: {group.company.domain}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{group.orderCount}</div>
                        <div className="text-sm text-muted-foreground">
                          {group.orderCount >= group.company.deliveryThreshold ? (
                            <Badge variant="secondary">Free Delivery</Badge>
                          ) : (
                            <span>
                              {group.company.deliveryThreshold - group.orderCount} more for free delivery
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Value</span>
                        <span className="font-medium">
                          ${(group.totalValue / 100).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Delivery Threshold</span>
                        <span className="font-medium">{group.company.deliveryThreshold} orders</span>
                      </div>
                    </div>

                    {/* Order List */}
                    <div className="mt-4 space-y-2">
                      <h4 className="font-semibold text-sm">Orders</h4>
                      {group.orders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between p-2 bg-muted rounded-md text-sm"
                        >
                          <span className="font-mono">{order.orderNumber}</span>
                          <Badge variant="outline">{order.status}</Badge>
                          <span>${(order.total / 100).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
                  <p className="text-muted-foreground">Orders will appear here as they come in</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Today's Special Tab */}
          {/* Menu Management Tab */}
          <TabsContent value="menu" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Menu Items</CardTitle>
                    <CardDescription>
                      Manage custom menu items (Square items are synced automatically)
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => setLocation("/admin/dish/new")}
                    className="bg-[#DC2626] hover:bg-[#DC2626]/90"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Dish
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {menuItems?.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="p-4">
                        <div className="flex gap-3">
                          <img
                            src={item.imageUrl || ""}
                            alt={item.name}
                            className="w-20 h-20 object-cover rounded-lg"
                          />
                          <div className="flex-1">
                            <h3 className="font-bold text-sm">{item.name}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {item.description}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="font-semibold">
                                ${(item.price / 100).toFixed(2)}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {item.category}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Today's Special Tab */}
          <TabsContent value="specials" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Manage Today's Special</CardTitle>
                <CardDescription>
                  Select a menu item to feature as today's special
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Current Special */}
                {todaysSpecial && (
                  <div className="p-4 bg-secondary/10 rounded-lg border border-secondary">
                    <div className="flex items-center gap-2 mb-2">
                      <Star className="h-5 w-5 text-secondary fill-secondary" />
                      <span className="font-semibold">Current Special</span>
                    </div>
                    <div className="flex gap-4">
                      <img
                        src={todaysSpecial.imageUrl || ""}
                        alt={todaysSpecial.name}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                      <div>
                        <h3 className="font-bold">{todaysSpecial.name}</h3>
                        <p className="text-sm text-muted-foreground">{todaysSpecial.description}</p>
                        <p className="text-sm font-semibold mt-2">
                          ${(todaysSpecial.price / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Select New Special */}
                <div className="space-y-3">
                  <Label htmlFor="special-select">Select New Special</Label>
                  <div className="flex gap-3">
                    <Select value={selectedSpecial} onValueChange={setSelectedSpecial}>
                      <SelectTrigger id="special-select" className="flex-1">
                        <SelectValue placeholder="Choose a menu item" />
                      </SelectTrigger>
                      <SelectContent>
                        {menuItems?.map((item) => (
                          <SelectItem key={item.id} value={item.id.toString()}>
                            {item.name} - ${(item.price / 100).toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleSetSpecial}
                      disabled={!selectedSpecial || setSpecial.isPending}
                    >
                      {setSpecial.isPending ? "Updating..." : "Set Special"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
