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

  const clearCart = () => {
    localStorage.removeItem("fuda_cart");
    setCartItems([]);
    window.dispatchEvent(new Event("cartUpdated"));
  };

  return {
    cartItems,
    totalItems,
    clearCart,
  };
}
