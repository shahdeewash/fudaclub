import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/hooks/useCart";
import { useLocation } from "wouter";

export function CartIndicator() {
  const { totalItems } = useCart();
  const [, setLocation] = useLocation();

  if (totalItems === 0) {
    return null;
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setLocation("/menu")}
      className="relative"
    >
      <ShoppingCart className="h-4 w-4 mr-2" />
      Cart
      <Badge 
        variant="destructive" 
        className="ml-2 px-1.5 py-0 h-5 min-w-5 flex items-center justify-center"
      >
        {totalItems}
      </Badge>
    </Button>
  );
}
