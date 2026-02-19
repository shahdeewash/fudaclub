import { useState, useEffect } from "react";

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

export function useCart() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    const loadCart = () => {
      const savedCart = localStorage.getItem("fuda_cart");
      if (savedCart) {
        try {
          const parsed = JSON.parse(savedCart);
          setCartItems(parsed);
        } catch (e) {
          console.error("Failed to parse cart:", e);
          setCartItems([]);
        }
      } else {
        setCartItems([]);
      }
    };

    loadCart();

    // Listen for storage events (cart updates from other tabs/windows)
    window.addEventListener("storage", loadCart);

    // Listen for custom cart update events (same tab)
    const handleCartUpdate = () => loadCart();
    window.addEventListener("cartUpdated", handleCartUpdate);

    return () => {
      window.removeEventListener("storage", loadCart);
      window.removeEventListener("cartUpdated", handleCartUpdate);
    };
  }, []);

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const saveCart = (items: CartItem[]) => {
    localStorage.setItem("fuda_cart", JSON.stringify(items));
    setCartItems(items);
    window.dispatchEvent(new Event("cartUpdated"));
  };

  const addItem = (itemId: number) => {
    const updatedItems = cartItems.map(item =>
      item.id === itemId
        ? { ...item, quantity: item.quantity + 1 }
        : item
    );
    saveCart(updatedItems);
  };

  const removeItem = (itemId: number) => {
    const item = cartItems.find(i => i.id === itemId);
    if (!item) return;

    if (item.quantity <= 1) {
      // Remove item completely if quantity is 1
      const updatedItems = cartItems.filter(i => i.id !== itemId);
      saveCart(updatedItems);
    } else {
      // Decrease quantity
      const updatedItems = cartItems.map(i =>
        i.id === itemId
          ? { ...i, quantity: i.quantity - 1 }
          : i
      );
      saveCart(updatedItems);
    }
  };

  const clearItem = (itemId: number) => {
    const updatedItems = cartItems.filter(i => i.id !== itemId);
    saveCart(updatedItems);
  };

  const clearCart = () => {
    localStorage.removeItem("fuda_cart");
    setCartItems([]);
    window.dispatchEvent(new Event("cartUpdated"));
  };

  return {
    items: cartItems,
    totalItems,
    addItem,
    removeItem,
    clearItem,
    clearCart,
  };
}
