import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { BarChart3, DollarSign, Package, Users, Star, Plus, Building2, User, Filter, Camera, X, Check, Upload, Pencil, Trash2, Download, Bell, GripVertical, RefreshCw, Link2, Link2Off } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useEffect } from "react";

type DateFilter = "today" | "yesterday" | "week" | "all";
type GroupBy = "all" | "company" | "individual";

type MenuItemType = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  imageUrl: string | null;
  isTodaysSpecial: boolean | null;
  isAvailable: boolean | null;
};

function SortableMenuItemCard({
  item,
  editingItemId, deletingItemId, editingImageId, editingImageUrl,
  editName, editDescription, editPrice, editCategory,
  updateMenuItem, deleteMenuItem, updateImage, toggleAvailability,
  setEditingItemId, setDeletingItemId, setEditingImageId, setEditingImageUrl,
  setEditName, setEditDescription, setEditPrice, setEditCategory,
  handleFileUpload, handleSaveImage,
}: {
  item: MenuItemType;
  editingItemId: number | null;
  deletingItemId: number | null;
  editingImageId: number | null;
  editingImageUrl: string;
  editName: string;
  editDescription: string;
  editPrice: string;
  editCategory: string;
  updateMenuItem: any;
  deleteMenuItem: any;
  updateImage: any;
  toggleAvailability: any;
  setEditingItemId: (id: number | null) => void;
  setDeletingItemId: (id: number | null) => void;
  setEditingImageId: (id: number | null) => void;
  setEditingImageUrl: (url: string) => void;
  setEditName: (v: string) => void;
  setEditDescription: (v: string) => void;
  setEditPrice: (v: string) => void;
  setEditCategory: (v: string) => void;
  handleFileUpload: (id: number, file: File) => void;
  handleSaveImage: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const isAvailable = item.isAvailable !== false;

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={!isAvailable ? 'opacity-60 border-dashed' : ''}>
        <CardContent className="p-4">
          {/* Drag handle + availability toggle row */}
          <div className="flex items-center justify-between mb-2">
            <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 rounded">
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{isAvailable ? 'Visible' : 'Hidden'}</span>
              <Switch
                checked={isAvailable}
                onCheckedChange={(checked) => toggleAvailability.mutate({ menuItemId: item.id, isAvailable: checked })}
                className="scale-75"
              />
            </div>
          </div>
          {/* Image with edit overlay */}
          <div className="relative mb-2">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} className="w-full h-40 object-cover rounded-lg" />
            ) : (
              <div className="w-full h-40 bg-muted rounded-lg flex items-center justify-center">
                <Camera className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
          {/* Always-visible Change Photo button */}
          {editingImageId !== item.id && (
            <button
              onClick={() => { setEditingImageId(item.id); setEditingImageUrl(item.imageUrl || ""); }}
              className="w-full mb-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/40 hover:border-foreground/60 rounded-md py-1.5 transition-colors"
            >
              <Camera className="h-3.5 w-3.5" />
              Change Photo
            </button>
          )}
          {/* Image edit panel */}
          {editingImageId === item.id && (
            <div className="mb-3 p-3 bg-muted rounded-lg space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Update Photo</p>
              <Input placeholder="Paste image URL..." value={editingImageUrl}
                onChange={(e) => setEditingImageUrl(e.target.value)} className="text-xs h-8" />
              {editingImageUrl && (
                <img src={editingImageUrl} alt="Preview" className="w-full h-24 object-cover rounded"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                <Upload className="h-3 w-3" />
                Upload from device
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(item.id, f); }} />
              </label>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs flex-1 bg-[#DC2626] hover:bg-[#DC2626]/90"
                  onClick={() => handleSaveImage(item.id)}
                  disabled={updateImage.isPending || !editingImageUrl.trim()}>
                  <Check className="h-3 w-3 mr-1" />Save
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setEditingImageId(null); setEditingImageUrl(""); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          {/* Item details or edit form */}
          {editingItemId === item.id ? (
            <div className="space-y-2">
              <Input placeholder="Item name" value={editName} onChange={(e) => setEditName(e.target.value)} className="text-xs h-8" />
              <Textarea placeholder="Description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="text-xs min-h-[60px]" />
              <div className="flex gap-2">
                <Input placeholder="Price (AUD)" type="number" step="0.01" value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)} className="text-xs h-8" />
                <Input placeholder="Category" value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)} className="text-xs h-8" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs flex-1 bg-[#DC2626] hover:bg-[#DC2626]/90"
                  onClick={() => updateMenuItem.mutate({ menuItemId: item.id, name: editName || undefined, description: editDescription || undefined, price: editPrice ? parseFloat(editPrice) : undefined, category: editCategory || undefined })}
                  disabled={updateMenuItem.isPending}>
                  <Check className="h-3 w-3 mr-1" />Save
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingItemId(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : deletingItemId === item.id ? (
            <div className="p-3 bg-destructive/10 rounded-lg space-y-2">
              <p className="text-xs font-medium text-destructive">Remove this item?</p>
              <p className="text-xs text-muted-foreground">This will hide it from the menu.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="h-7 text-xs flex-1"
                  onClick={() => deleteMenuItem.mutate({ menuItemId: item.id })} disabled={deleteMenuItem.isPending}>
                  <Trash2 className="h-3 w-3 mr-1" />Remove
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDeletingItemId(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1">
              <h3 className="font-bold text-sm">{item.name}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="font-semibold text-sm">${(item.price / 100).toFixed(2)}</span>
                <Badge variant="outline" className="text-xs">{item.category}</Badge>
              </div>
              {item.isTodaysSpecial && (
                <Badge variant="secondary" className="mt-1 text-xs">
                  <Star className="h-3 w-3 mr-1" />Today's Special
                </Badge>
              )}
              {!isAvailable && (
                <Badge variant="outline" className="mt-1 text-xs text-muted-foreground">
                  Hidden from menu
                </Badge>
              )}
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
                  onClick={() => { setEditingItemId(item.id); setEditName(item.name); setEditDescription(item.description || ""); setEditPrice((item.price / 100).toFixed(2)); setEditCategory(item.category || ""); }}>
                  <Pencil className="h-3 w-3 mr-1" />Edit
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => setDeletingItemId(item.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Admin() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedSpecial, setSelectedSpecial] = useState<string>("");
  const [ordersDateFilter, setOrdersDateFilter] = useState<DateFilter>("today");
  const [groupBy, setGroupBy] = useState<GroupBy>("all");
  const [isExporting, setIsExporting] = useState(false);

  // New Special item form state
  const [newSpecialName, setNewSpecialName] = useState("");
  const [newSpecialDescription, setNewSpecialDescription] = useState("");
  const [newSpecialPrice, setNewSpecialPrice] = useState("");
  const [newSpecialCategory, setNewSpecialCategory] = useState("special");
  const [newSpecialImageUrl, setNewSpecialImageUrl] = useState("");

  // Image editing state
  const [editingImageId, setEditingImageId] = useState<number | null>(null);
  const [editingImageUrl, setEditingImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  // Item editing state
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

  // Category management state
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [uploadingSpecialImage, setUploadingSpecialImage] = useState(false);

  // Inline add-item form state
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [addItemName, setAddItemName] = useState("");
  const [addItemDescription, setAddItemDescription] = useState("");
  const [addItemPrice, setAddItemPrice] = useState("");
  const [addItemCategory, setAddItemCategory] = useState("");
  const [addItemImageUrl, setAddItemImageUrl] = useState("");
  const [uploadingAddItemImage, setUploadingAddItemImage] = useState(false);

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

  const { data: menuItems } = trpc.menu.getAllAdmin.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );
  const { data: todaysSpecial } = trpc.menu.getTodaysSpecial.useQuery();

  // Bulk price update state
  const [bulkPriceCategory, setBulkPriceCategory] = useState<string | null>(null);
  const [bulkPriceValue, setBulkPriceValue] = useState("");

  // Local item order state for optimistic drag-to-reorder
  const [localItemOrder, setLocalItemOrder] = useState<Record<string, number[]>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const utils = trpc.useUtils();

  const { refetch: refetchExport } = trpc.stats.exportOrders.useQuery(
    { dateFilter: ordersDateFilter },
    { enabled: false } // Only fetch on demand
  );

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const result = await refetchExport();
      const rows = result.data;
      if (!rows || rows.length === 0) {
        toast.info("No orders to export for the selected filters.");
        return;
      }
      const headers = Object.keys(rows[0]);
      const csvContent = [
        headers.join(","),
        ...rows.map(row =>
          headers.map(h => {
            const val = String((row as any)[h] ?? "");
            return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
          }).join(",")
        )
      ].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fuda-orders-${ordersDateFilter}-${new Date().toISOString().substring(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} orders to CSV`);
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

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

  const updateImage = trpc.menu.updateImage.useMutation({
    onSuccess: () => {
      toast.success("Image updated successfully!");
      utils.menu.getAll.invalidate();
      utils.menu.getTodaysSpecial.invalidate();
      setEditingImageId(null);
      setEditingImageUrl("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMenuItem = trpc.menu.update.useMutation({
    onSuccess: () => {
      toast.success("Menu item updated!");
      utils.menu.getAll.invalidate();
      utils.menu.getAllAdmin.invalidate();
      setEditingItemId(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMenuItem = trpc.menu.delete.useMutation({
    onSuccess: () => {
      toast.success("Menu item removed!");
      utils.menu.getAll.invalidate();
      utils.menu.getAllAdmin.invalidate();
      setDeletingItemId(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const sendExpiryReminders = trpc.stats.sendExpiryReminders.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to send reminders");
    },
  });

  const renameCategory = trpc.menu.renameCategory.useMutation({
    onSuccess: () => {
      toast.success("Category renamed!");
      utils.menu.getAllAdmin.invalidate();
      utils.menu.getAll.invalidate();
      setRenamingCategory(null);
      setNewCategoryName("");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteCategory = trpc.menu.deleteCategory.useMutation({
    onSuccess: () => {
      toast.success("Category and all its items deleted!");
      utils.menu.getAllAdmin.invalidate();
      utils.menu.getAll.invalidate();
      setDeletingCategory(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkUpdatePrice = trpc.menu.bulkUpdateCategoryPrice.useMutation({
    onSuccess: () => {
      toast.success("All items in category updated!");
      utils.menu.getAllAdmin.invalidate();
      utils.menu.getAll.invalidate();
      setBulkPriceCategory(null);
      setBulkPriceValue("");
    },
    onError: (error) => toast.error(error.message),
  });

  // Square integration
  const { data: squareConnection, refetch: refetchSquareConnection } = trpc.square.getConnection.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );
  const { data: squareAuthUrl } = trpc.square.getAuthUrl.useQuery(
    { origin: typeof window !== 'undefined' ? window.location.origin : '' },
    { enabled: isAuthenticated && user?.role === 'admin' }
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const syncMenu = trpc.square.syncMenu.useMutation({
    onSuccess: (result) => {
      toast.success(`Sync complete: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`);
      utils.menu.getAllAdmin.invalidate();
      utils.menu.getAll.invalidate();
      refetchSquareConnection();
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setIsSyncing(false),
  });
  const disconnectSquare = trpc.square.disconnect.useMutation({
    onSuccess: () => {
      toast.success('Square account disconnected');
      refetchSquareConnection();
    },
    onError: (error) => toast.error(error.message),
  });

  // Handle Square OAuth callback URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('square_connected') === '1') {
      toast.success('Square account connected successfully!');
      refetchSquareConnection();
      window.history.replaceState({}, '', '/admin');
    } else if (params.get('square_error')) {
      toast.error('Square connection failed: ' + params.get('square_error'));
      window.history.replaceState({}, '', '/admin');
    }
  }, []);

  const reorderItems = trpc.menu.reorderItems.useMutation({
    onError: (error) => toast.error("Reorder failed: " + error.message),
  });

  const toggleAvailability = trpc.menu.toggleAvailability.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.isAvailable ? "Item is now visible on menu" : "Item hidden from menu");
      utils.menu.getAllAdmin.invalidate();
      utils.menu.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleDragEnd = (event: DragEndEvent, category: string, catItems: typeof menuItems) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !catItems) return;
    const oldIndex = catItems.findIndex(i => i.id === active.id);
    const newIndex = catItems.findIndex(i => i.id === over.id);
    const reordered = arrayMove(catItems, oldIndex, newIndex);
    // Optimistic update
    setLocalItemOrder(prev => ({ ...prev, [category]: reordered.map(i => i.id) }));
    // Persist to server
    reorderItems.mutate({
      items: reordered.map((item, idx) => ({ id: item.id, sortOrder: idx }))
    });
  };

  const createMenuItem = trpc.menu.create.useMutation({
    onSuccess: (newItem) => {
      toast.success(`"${newItem.name}" created and set as today's special!`);
      utils.menu.getAll.invalidate();
      utils.menu.getAllAdmin.invalidate();
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

  const addMenuItem = trpc.menu.create.useMutation({
    onSuccess: (newItem) => {
      toast.success(`"${newItem.name}" added to menu!`);
      utils.menu.getAll.invalidate();
      utils.menu.getAllAdmin.invalidate();
      setShowAddItemForm(false);
      setAddItemName("");
      setAddItemDescription("");
      setAddItemPrice("");
      setAddItemCategory("");
      setAddItemImageUrl("");
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

  const handleSaveImage = (menuItemId: number) => {
    if (!editingImageUrl.trim()) {
      toast.error("Please enter an image URL");
      return;
    }
    updateImage.mutate({ menuItemId, imageUrl: editingImageUrl.trim() });
  };

  const handleFileUpload = async (menuItemId: number, file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { url } = await response.json();
      // Set the permanent S3 URL and save it
      setEditingImageUrl(url);
      updateImage.mutate({ menuItemId, imageUrl: url });
    } catch (error) {
      toast.error("Failed to upload image. Please try pasting a URL instead.");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSpecialFileUpload = async (file: File) => {
    setUploadingSpecialImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { url } = await response.json();
      setNewSpecialImageUrl(url);
      toast.success("Image uploaded!");
    } catch (error) {
      toast.error("Failed to upload image. Please try pasting a URL instead.");
    } finally {
      setUploadingSpecialImage(false);
    }
  };

  const handleAddItemFileUpload = async (file: File) => {
    setUploadingAddItemImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { url } = await response.json();
      setAddItemImageUrl(url);
      toast.success("Image uploaded!");
    } catch (error) {
      toast.error("Failed to upload image. Please try pasting a URL instead.");
    } finally {
      setUploadingAddItemImage(false);
    }
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

            {/* Subscription Expiry Reminders */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-sm font-medium">Subscription Expiry Reminders</CardTitle>
                  <CardDescription className="text-xs mt-1">Notify yourself about subscriptions expiring within 3 days</CardDescription>
                </div>
                <Bell className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sendExpiryReminders.mutate()}
                  disabled={sendExpiryReminders.isPending}
                >
                  {sendExpiryReminders.isPending ? (
                    <><span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent inline-block" />Checking...</>
                  ) : (
                    <><Bell className="mr-2 h-3 w-3" />Send Reminders Now</>
                  )}
                </Button>
              </CardContent>
            </Card>
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
                  <div className="ml-auto flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{allOrders?.length || 0} orders</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportCSV}
                      disabled={isExporting}
                      className="h-8 text-xs"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {isExporting ? "Exporting..." : "Download CSV"}
                    </Button>
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
            {/* Square Connect Card */}
            <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-black flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.03 5H6.97A1.97 1.97 0 0 0 5 6.97v10.06C5 18.12 5.88 19 6.97 19h10.06A1.97 1.97 0 0 0 19 17.03V6.97A1.97 1.97 0 0 0 17.03 5zm-4.53 9.5H11.5V9.5h1v5zm0-6H11.5v-1h1v1z"/></svg>
                    </div>
                    <div>
                      <CardTitle className="text-base">Square Catalog</CardTitle>
                      <CardDescription className="text-xs">
                        {squareConnection?.connected
                          ? `Connected: ${squareConnection.merchantName ?? squareConnection.merchantId}`
                          : 'Connect your Square account to import menu items'}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {squareConnection?.connected ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => { setIsSyncing(true); syncMenu.mutate(); }}
                          disabled={isSyncing || syncMenu.isPending}
                          className="bg-[#DC2626] hover:bg-[#DC2626]/90"
                        >
                          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                          {isSyncing ? 'Syncing...' : 'Sync from Square'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => disconnectSquare.mutate()}
                          disabled={disconnectSquare.isPending}
                        >
                          <Link2Off className="h-4 w-4 mr-2" />
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => squareAuthUrl?.url && window.open(squareAuthUrl.url, '_blank')}
                        disabled={!squareAuthUrl?.url}
                        className="bg-black hover:bg-black/80 text-white"
                      >
                        <Link2 className="h-4 w-4 mr-2" />
                        Connect Square
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>

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
                    onClick={() => setShowAddItemForm(v => !v)}
                    className="bg-[#DC2626] hover:bg-[#DC2626]/90"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Inline Add Item Form */}
                {showAddItemForm && (
                  <div className="p-4 bg-muted/50 rounded-xl border border-dashed space-y-4">
                    <h3 className="font-semibold text-sm flex items-center gap-2"><Plus className="h-4 w-4" />New Menu Item</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Name *</Label>
                        <Input placeholder="e.g. Grilled Barramundi" value={addItemName} onChange={e => setAddItemName(e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Price (AUD) *</Label>
                        <Input type="number" step="0.01" min="0" placeholder="e.g. 18.50" value={addItemPrice} onChange={e => setAddItemPrice(e.target.value)} className="h-8 text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Textarea placeholder="Describe the dish..." value={addItemDescription} onChange={e => setAddItemDescription(e.target.value)} className="text-sm min-h-[60px]" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Category</Label>
                        <Input
                          placeholder="e.g. main, wrap, salad…"
                          value={addItemCategory}
                          onChange={e => setAddItemCategory(e.target.value)}
                          list="existing-categories"
                          className="h-8 text-sm"
                        />
                        <datalist id="existing-categories">
                          {Array.from(new Set(menuItems?.map(i => i.category || "Uncategorised") ?? [])).map(cat => (
                            <option key={cat} value={cat} />
                          ))}
                        </datalist>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Image</Label>
                        <div className="flex gap-2">
                          <Input placeholder="Paste URL or upload…" value={addItemImageUrl} onChange={e => setAddItemImageUrl(e.target.value)} className="h-8 text-sm flex-1" />
                          <label className="cursor-pointer">
                            <Button type="button" variant="outline" size="sm" className="h-8 gap-1 pointer-events-none" disabled={uploadingAddItemImage}>
                              {uploadingAddItemImage ? <span className="text-xs">Uploading…</span> : <><Upload className="h-3 w-3" /><span className="text-xs">Upload</span></>}
                            </Button>
                            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleAddItemFileUpload(f); }} />
                          </label>
                        </div>
                        {addItemImageUrl && (
                          <img src={addItemImageUrl} alt="Preview" className="w-full h-24 object-cover rounded mt-1" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="bg-[#DC2626] hover:bg-[#DC2626]/90 flex-1"
                        disabled={addMenuItem.isPending || !addItemName.trim() || !addItemPrice}
                        onClick={() => {
                          if (!addItemName.trim()) { toast.error("Name is required"); return; }
                          if (!addItemPrice || isNaN(parseFloat(addItemPrice))) { toast.error("Valid price is required"); return; }
                          addMenuItem.mutate({
                            name: addItemName.trim(),
                            description: addItemDescription.trim() || undefined,
                            category: addItemCategory.trim() || undefined,
                            price: parseFloat(addItemPrice),
                            imageUrl: addItemImageUrl.trim() || undefined,
                            setAsSpecial: false,
                          });
                        }}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        {addMenuItem.isPending ? "Adding…" : "Add to Menu"}
                      </Button>
                      <Button variant="outline" onClick={() => { setShowAddItemForm(false); setAddItemName(""); setAddItemDescription(""); setAddItemPrice(""); setAddItemCategory(""); setAddItemImageUrl(""); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Category groups */}
                {menuItems && (() => {
                  const categories = Array.from(new Set(menuItems.map(i => i.category || "Uncategorised")));
                  return categories.map(cat => {
                    // Apply local drag order if present
                    const localOrder = localItemOrder[cat];
                    const rawItems = menuItems.filter(i => (i.category || "Uncategorised") === cat);
                    const catItems = localOrder
                      ? localOrder.map(id => rawItems.find(i => i.id === id)!).filter(Boolean)
                      : rawItems;
                    return (
                      <div key={cat}>
                        {/* Category header with rename/delete/bulk-price */}
                        <div className="flex flex-wrap items-center gap-2 mb-3 pb-2 border-b">
                          {renamingCategory === cat ? (
                            <div className="flex items-center gap-2 flex-1">
                              <Input
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                className="h-7 text-sm font-semibold max-w-[200px]"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && newCategoryName.trim()) {
                                    renameCategory.mutate({ oldName: cat, newName: newCategoryName.trim() });
                                  } else if (e.key === "Escape") {
                                    setRenamingCategory(null);
                                  }
                                }}
                              />
                              <Button size="sm" className="h-7 text-xs bg-[#DC2626] hover:bg-[#DC2626]/90"
                                onClick={() => newCategoryName.trim() && renameCategory.mutate({ oldName: cat, newName: newCategoryName.trim() })}
                                disabled={renameCategory.isPending || !newCategoryName.trim()}>
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => setRenamingCategory(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : deletingCategory === cat ? (
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-sm font-semibold text-destructive">Delete "{cat}" and all {catItems.length} items?</span>
                              <Button size="sm" variant="destructive" className="h-7 text-xs"
                                onClick={() => deleteCategory.mutate({ category: cat })}
                                disabled={deleteCategory.isPending}>
                                <Trash2 className="h-3 w-3 mr-1" /> Delete All
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => setDeletingCategory(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : bulkPriceCategory === cat ? (
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-sm font-semibold flex-1">Set price for all "{cat}" items:</span>
                              <Input
                                type="number" step="0.01" min="0"
                                placeholder="e.g. 12.50"
                                value={bulkPriceValue}
                                onChange={(e) => setBulkPriceValue(e.target.value)}
                                className="h-7 text-xs w-28"
                                autoFocus
                              />
                              <Button size="sm" className="h-7 text-xs bg-[#DC2626] hover:bg-[#DC2626]/90"
                                onClick={() => bulkPriceValue && bulkUpdatePrice.mutate({ category: cat, price: parseFloat(bulkPriceValue) })}
                                disabled={bulkUpdatePrice.isPending || !bulkPriceValue}>
                                <Check className="h-3 w-3 mr-1" /> Apply
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => { setBulkPriceCategory(null); setBulkPriceValue(""); }}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <h3 className="font-semibold text-base capitalize flex-1">{cat} <span className="text-xs text-muted-foreground font-normal">({catItems.length})</span></h3>
                              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                                onClick={() => { setBulkPriceCategory(cat); setBulkPriceValue(""); }}>
                                <DollarSign className="h-3 w-3" /> Set Price
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                                onClick={() => { setRenamingCategory(cat); setNewCategoryName(cat); }}>
                                <Pencil className="h-3 w-3" /> Rename
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                                onClick={() => setDeletingCategory(cat)}>
                                <Trash2 className="h-3 w-3" /> Delete
                              </Button>
                            </>
                          )}
                        </div>
                        {/* Items grid with drag-to-reorder */}
                        <DndContext sensors={sensors} collisionDetection={closestCenter}
                          onDragEnd={(e) => handleDragEnd(e, cat, catItems)}>
                          <SortableContext items={catItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {catItems.map((item) => (
                                <SortableMenuItemCard
                                  key={item.id}
                                  item={item}
                                  editingItemId={editingItemId}
                                  deletingItemId={deletingItemId}
                                  editingImageId={editingImageId}
                                  editingImageUrl={editingImageUrl}
                                  editName={editName}
                                  editDescription={editDescription}
                                  editPrice={editPrice}
                                  editCategory={editCategory}
                                  updateMenuItem={updateMenuItem}
                                  deleteMenuItem={deleteMenuItem}
                                  updateImage={updateImage}
                                  toggleAvailability={toggleAvailability}
                                  setEditingItemId={setEditingItemId}
                                  setDeletingItemId={setDeletingItemId}
                                  setEditingImageId={setEditingImageId}
                                  setEditingImageUrl={setEditingImageUrl}
                                  setEditName={setEditName}
                                  setEditDescription={setEditDescription}
                                  setEditPrice={setEditPrice}
                                  setEditCategory={setEditCategory}
                                  handleFileUpload={handleFileUpload}
                                  handleSaveImage={handleSaveImage}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      </div>
                    );
                  });
                })()}
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
                    <Label htmlFor="special-image">Image (optional)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="special-image"
                        placeholder="Paste image URL..."
                        value={newSpecialImageUrl}
                        onChange={(e) => setNewSpecialImageUrl(e.target.value)}
                        className="flex-1"
                      />
                      <label className="cursor-pointer">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 gap-1.5 pointer-events-none"
                          disabled={uploadingSpecialImage}
                        >
                          {uploadingSpecialImage ? (
                            <span className="text-xs">Uploading...</span>
                          ) : (
                            <>
                              <Upload className="h-4 w-4" />
                              <span className="text-xs">Upload</span>
                            </>
                          )}
                        </Button>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleSpecialFileUpload(file);
                          }}
                        />
                      </label>
                    </div>
                    {newSpecialImageUrl && (
                      <img
                        src={newSpecialImageUrl}
                        alt="Preview"
                        className="w-full h-32 object-cover rounded-lg mt-1"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
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
