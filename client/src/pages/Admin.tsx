import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { BarChart3, DollarSign, Package, Users, Star, Plus, Building2, User, Filter } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type DateFilter = "today" | "yesterday" | "week" | "all";
type GroupBy = "all" | "company" | "individual";

export default function Admin() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedSpecial, setSelectedSpecial] = useState<string>("");
  const [ordersDateFilter, setOrdersDateFilter] = useState<DateFilter>("today");
  const [groupBy, setGroupBy] = useState<GroupBy>("all");

  // New Special item form state
  const [newSpecialName, setNewSpecialName] = useState("");
  const [newSpecialDescription, setNewSpecialDescription] = useState("");
  const [newSpecialPrice, setNewSpecialPrice] = useState("");
  const [newSpecialCategory, setNewSpecialCategory] = useState("special");
  const [newSpecialImageUrl, setNewSpecialImageUrl] = useState("");

  const { data: stats } = trpc.stats.getToday.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const { data: allOrders, isLoading: ordersLoading } = trpc.stats.getAllOrdersFlat.useQuery(
    { dateFilter: ordersDateFilter },
    { enabled: isAuthenticated && user?.role === "admin" }
  );

  const { data: ordersByCompany } = trpc.stats.getOrdersByCompany.useQuery(
    { dateFilter: ordersDateFilter },
    { enabled: isAuthenticated && user?.role === "admin" && groupBy === "company" }
  );

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

  const createMenuItem = trpc.menu.create.useMutation({
    onSuccess: (newItem) => {
      toast.success(`"${newItem.name}" created and set as today's special!`);
      utils.menu.getAll.invalidate();
      utils.menu.getTodaysSpecial.invalidate();
      // Reset form
      setNewSpecialName("");
      setNewSpecialDescription("");
      setNewSpecialPrice("");
      setNewSpecialCategory("special");
      setNewSpecialImageUrl("");
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

  const handleCreateSpecial = () => {
    if (!newSpecialName.trim()) {
      toast.error("Please enter a name for the special item");
      return;
    }
    if (!newSpecialPrice || isNaN(parseFloat(newSpecialPrice))) {
      toast.error("Please enter a valid price");
      return;
    }

    createMenuItem.mutate({
      name: newSpecialName.trim(),
      description: newSpecialDescription.trim() || undefined,
      category: newSpecialCategory,
      price: parseFloat(newSpecialPrice),
      imageUrl: newSpecialImageUrl.trim() || undefined,
      setAsSpecial: true,
    });
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-yellow-100 text-yellow-800",
    preparing: "bg-purple-100 text-purple-800",
    ready: "bg-green-100 text-green-800",
    delivered: "bg-blue-100 text-blue-800",
    canceled: "bg-red-100 text-red-800",
  };

  // Group orders by company for company view
  const groupedByCompany = allOrders?.reduce((acc, order) => {
    const key = (order as any).companyName || `Company-${order.companyId}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(order);
    return acc;
  }, {} as Record<string, typeof allOrders>);

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
            <TabsTrigger value="orders">All Orders</TabsTrigger>
            <TabsTrigger value="menu">Menu Management</TabsTrigger>
            <TabsTrigger value="specials">Today's Special</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
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

          {/* All Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Filters:</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Date:</Label>
                    <Select value={ordersDateFilter} onValueChange={(v) => setOrdersDateFilter(v as DateFilter)}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="yesterday">Yesterday</SelectItem>
                        <SelectItem value="week">Last 7 Days</SelectItem>
                        <SelectItem value="all">All Time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Group by:</Label>
                    <div className="flex gap-1 border rounded-md p-1">
                      <Button
                        size="sm"
                        variant={groupBy === "all" ? "default" : "ghost"}
                        onClick={() => setGroupBy("all")}
                        className="h-7 text-xs"
                      >
                        All
                      </Button>
                      <Button
                        size="sm"
                        variant={groupBy === "company" ? "default" : "ghost"}
                        onClick={() => setGroupBy("company")}
                        className="h-7 text-xs"
                      >
                        <Building2 className="h-3 w-3 mr-1" />
                        By Company
                      </Button>
                      <Button
                        size="sm"
                        variant={groupBy === "individual" ? "default" : "ghost"}
                        onClick={() => setGroupBy("individual")}
                        className="h-7 text-xs"
                      >
                        <User className="h-3 w-3 mr-1" />
                        Individual
                      </Button>
                    </div>
                  </div>
                  <div className="ml-auto text-sm text-muted-foreground">
                    {allOrders?.length || 0} orders
                  </div>
                </div>
              </CardContent>
            </Card>

            {ordersLoading ? (
              <div className="text-center py-12">Loading orders...</div>
            ) : groupBy === "company" ? (
              /* Group by Company View */
              <div className="space-y-4">
                {groupedByCompany && Object.keys(groupedByCompany).length > 0 ? (
                  Object.entries(groupedByCompany).map(([companyName, compOrders]) => (
                    <Card key={companyName}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-primary" />
                            <div>
                              <CardTitle>{companyName}</CardTitle>
                              <CardDescription>{compOrders.length} orders</CardDescription>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold">
                              ${(compOrders.reduce((s, o) => s + o.total, 0) / 100).toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">Total value</div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {compOrders.map((order) => (
                            <div key={order.id} className="p-3 bg-muted rounded-md text-sm">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                  <span className="font-mono font-semibold">{order.orderNumber}</span>
                                  <span className="text-muted-foreground ml-2">· {(order as any).userName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge className={`text-xs ${statusColors[order.status] || ""}`} variant="outline">
                                    {order.status}
                                  </Badge>
                                  <span className="font-semibold">${(order.total / 100).toFixed(2)}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(order.orderDate).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                                  </span>
                                </div>
                              </div>
                              {(order as any).items && (order as any).items.length > 0 && (
                                <div className="mt-2 pl-3 border-l-2 border-primary/20 space-y-1">
                                  {(order as any).items.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                                      <span>{item.quantity}x {item.itemName}{item.isFree && <Badge variant="secondary" className="ml-1 text-xs">Free</Badge>}</span>
                                      <span>${(item.totalPrice / 100).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
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
                      <p className="text-muted-foreground">No orders found for this period</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : groupBy === "individual" ? (
              /* Individual View - grouped by user */
              <div className="space-y-4">
                {allOrders && allOrders.length > 0 ? (
                  Object.entries(
                    allOrders.reduce((acc, order) => {
                      const key = (order as any).userName || "Unknown";
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(order);
                      return acc;
                    }, {} as Record<string, typeof allOrders>)
                  ).map(([userName, userOrders]) => (
                    <Card key={userName}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <User className="h-5 w-5 text-primary" />
                            <div>
                              <CardTitle>{userName}</CardTitle>
                              <CardDescription>
                                {(userOrders[0] as any).companyName} · {userOrders.length} orders
                              </CardDescription>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold">
                              ${(userOrders.reduce((s, o) => s + o.total, 0) / 100).toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">Total spent</div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {userOrders.map((order) => (
                            <div key={order.id} className="p-3 bg-muted rounded-md text-sm">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <span className="font-mono font-semibold">{order.orderNumber}</span>
                                <div className="flex items-center gap-2">
                                  <Badge className={`text-xs ${statusColors[order.status] || ""}`} variant="outline">
                                    {order.status}
                                  </Badge>
                                  <span className="font-semibold">${(order.total / 100).toFixed(2)}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(order.orderDate).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                                  </span>
                                </div>
                              </div>
                              {(order as any).items && (order as any).items.length > 0 && (
                                <div className="mt-2 pl-3 border-l-2 border-primary/20 space-y-1">
                                  {(order as any).items.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                                      <span>{item.quantity}x {item.itemName}</span>
                                      <span>${(item.totalPrice / 100).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
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
                      <p className="text-muted-foreground">No orders found for this period</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              /* All Orders Flat View */
              <div className="space-y-3">
                {allOrders && allOrders.length > 0 ? (
                  allOrders.map((order) => (
                    <Card key={order.id}>
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between flex-wrap gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-mono font-bold">{order.orderNumber}</span>
                              <Badge className={`text-xs ${statusColors[order.status] || ""}`} variant="outline">
                                {order.status}
                              </Badge>
                              {order.fulfillmentType === "delivery" ? (
                                <Badge variant="secondary" className="text-xs">Delivery</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">Pickup</Badge>
                              )}
                              {order.dailyCreditUsed && (
                                <Badge variant="outline" className="text-xs">Credit Used</Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              <span className="font-medium">{(order as any).userName}</span>
                              <span className="mx-1">·</span>
                              <span>{(order as any).companyName}</span>
                            </div>
                            {(order as any).items && (order as any).items.length > 0 && (
                              <div className="mt-2 text-sm text-muted-foreground">
                                {(order as any).items.map((item: any, idx: number) => (
                                  <span key={idx}>
                                    {idx > 0 && ", "}
                                    {item.quantity}x {item.itemName}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-lg">${(order.total / 100).toFixed(2)}</div>
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
          </TabsContent>

          {/* Menu Management Tab */}
          <TabsContent value="menu" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Menu Items</CardTitle>
                    <CardDescription>
                      Manage custom menu items
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
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-20 h-20 object-cover rounded-lg"
                            />
                          )}
                          <div className="flex-1">
                            <h3 className="font-bold text-sm">{item.name}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {item.description}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="font-semibold text-sm">
                                ${(item.price / 100).toFixed(2)}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {item.category}
                              </Badge>
                            </div>
                            {item.isTodaysSpecial && (
                              <Badge variant="secondary" className="mt-1 text-xs">
                                <Star className="h-3 w-3 mr-1" />
                                Today's Special
                              </Badge>
                            )}
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
            {/* Current Special */}
            {todaysSpecial && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-secondary fill-secondary" />
                    <CardTitle>Current Today's Special</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    {todaysSpecial.imageUrl && (
                      <img
                        src={todaysSpecial.imageUrl}
                        alt={todaysSpecial.name}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                    )}
                    <div>
                      <h3 className="font-bold text-lg">{todaysSpecial.name}</h3>
                      <p className="text-sm text-muted-foreground">{todaysSpecial.description}</p>
                      <p className="text-sm font-semibold mt-2">
                        ${(todaysSpecial.price / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Option 1: Create New Special Item */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Create New Special Item
                </CardTitle>
                <CardDescription>
                  Create a brand new dish and set it as today's special
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="special-name">Item Name *</Label>
                    <Input
                      id="special-name"
                      placeholder="e.g., Grilled Barramundi"
                      value={newSpecialName}
                      onChange={(e) => setNewSpecialName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="special-price">Price (AUD) *</Label>
                    <Input
                      id="special-price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g., 18.50"
                      value={newSpecialPrice}
                      onChange={(e) => setNewSpecialPrice(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="special-description">Description</Label>
                  <Textarea
                    id="special-description"
                    placeholder="Describe the dish, ingredients, etc."
                    value={newSpecialDescription}
                    onChange={(e) => setNewSpecialDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="special-category">Category</Label>
                    <Select value={newSpecialCategory} onValueChange={setNewSpecialCategory}>
                      <SelectTrigger id="special-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="special">Special</SelectItem>
                        <SelectItem value="main">Main</SelectItem>
                        <SelectItem value="wrap">Wrap</SelectItem>
                        <SelectItem value="salad">Salad</SelectItem>
                        <SelectItem value="soup">Soup</SelectItem>
                        <SelectItem value="dessert">Dessert</SelectItem>
                        <SelectItem value="drink">Drink</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="special-image">Image URL (optional)</Label>
                    <Input
                      id="special-image"
                      placeholder="https://example.com/image.jpg"
                      value={newSpecialImageUrl}
                      onChange={(e) => setNewSpecialImageUrl(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleCreateSpecial}
                  disabled={createMenuItem.isPending || !newSpecialName.trim() || !newSpecialPrice}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {createMenuItem.isPending ? "Creating..." : "Create & Set as Today's Special"}
                </Button>
              </CardContent>
            </Card>

            {/* Option 2: Select Existing Item as Special */}
            <Card>
              <CardHeader>
                <CardTitle>Set Existing Item as Special</CardTitle>
                <CardDescription>
                  Select an existing menu item to feature as today's special
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Select value={selectedSpecial} onValueChange={setSelectedSpecial}>
                    <SelectTrigger className="flex-1">
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
