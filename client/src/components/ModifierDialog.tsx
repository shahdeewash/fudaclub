import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle2, Circle, AlertCircle } from "lucide-react";

export interface SelectedModifier {
  id: number;
  name: string;
  priceInCents: number;
}

export interface ModifierSelection {
  [modifierListId: number]: SelectedModifier[];
}

interface ModifierDialogProps {
  open: boolean;
  onClose: () => void;
  menuItemId: number;
  menuItemName: string;
  menuItemPrice: number;
  onConfirm: (selections: ModifierSelection, extraCents: number) => void;
}

export function ModifierDialog({
  open,
  onClose,
  menuItemId,
  menuItemName,
  menuItemPrice,
  onConfirm,
}: ModifierDialogProps) {
  const [selections, setSelections] = useState<ModifierSelection>({});
  const [attempted, setAttempted] = useState(false);

  const { data: modifierLists, isLoading } = trpc.menu.getModifiers.useQuery(
    { menuItemId },
    { enabled: open && menuItemId > 0 }
  );

  // Reset selections when dialog opens for a new item
  useEffect(() => {
    if (open) {
      setSelections({});
      setAttempted(false);
    }
  }, [open, menuItemId]);

  const toggleModifier = (listId: number, selectionType: string, mod: SelectedModifier) => {
    setSelections(prev => {
      const current = prev[listId] ?? [];
      if (selectionType === "SINGLE") {
        // Radio-style: replace selection (clicking selected item deselects it)
        const alreadySelected = current.some(m => m.id === mod.id);
        return { ...prev, [listId]: alreadySelected ? [] : [mod] };
      } else {
        // Checkbox-style: toggle
        const alreadySelected = current.some(m => m.id === mod.id);
        return {
          ...prev,
          [listId]: alreadySelected
            ? current.filter(m => m.id !== mod.id)
            : [...current, mod],
        };
      }
    });
  };

  const extraCents = Object.values(selections)
    .flat()
    .reduce((sum, m) => sum + m.priceInCents, 0);

  const totalCents = menuItemPrice + extraCents;

  // Required = SINGLE-select lists that have no selection yet
  const missingRequired = (modifierLists ?? []).filter(
    list => list.selectionType === "SINGLE" && (selections[list.id] ?? []).length === 0
  );

  const handleConfirm = () => {
    setAttempted(true);
    if (missingRequired.length > 0) return; // block — validation shown inline
    onConfirm(selections, extraCents);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{menuItemName}</DialogTitle>
          <p className="text-sm text-muted-foreground">Customise your order</p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !modifierLists || modifierLists.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No customisation options available.</p>
        ) : (
          <div className="space-y-6 py-2">
            {modifierLists.map(list => {
              const isRequired = list.selectionType === "SINGLE";
              const hasSelection = (selections[list.id] ?? []).length > 0;
              const showError = attempted && isRequired && !hasSelection;
              return (
                <div key={list.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-semibold text-sm">{list.name}</h3>
                    <Badge
                      variant={isRequired ? "default" : "outline"}
                      className={`text-xs ${isRequired ? "bg-primary/10 text-primary border-primary/30" : ""}`}
                    >
                      {isRequired ? "Required · Choose one" : "Optional · Choose any"}
                    </Badge>
                    {showError && (
                      <span className="flex items-center gap-1 text-xs text-destructive ml-auto">
                        <AlertCircle className="h-3 w-3" />
                        Please select one
                      </span>
                    )}
                  </div>
                  <div className={`space-y-2 rounded-lg transition-all ${showError ? "ring-1 ring-destructive/50 p-2" : ""}`}>
                    {list.modifiers.map(mod => {
                      const isSelected = (selections[list.id] ?? []).some(m => m.id === mod.id);
                      return (
                        <button
                          key={mod.id}
                          onClick={() => toggleModifier(list.id, list.selectionType, mod)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5 text-foreground"
                              : showError
                              ? "border-destructive/30 hover:border-destructive/60 hover:bg-destructive/5"
                              : "border-border hover:border-primary/40 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {list.selectionType === "SINGLE" ? (
                              isSelected
                                ? <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                                : <Circle className={`h-4 w-4 flex-shrink-0 ${showError ? "text-destructive/60" : "text-muted-foreground"}`} />
                            ) : (
                              <div className={`h-4 w-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                                isSelected ? "border-primary bg-primary" : "border-muted-foreground"
                              }`}>
                                {isSelected && <svg className="h-2.5 w-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                              </div>
                            )}
                            <span className="text-sm font-medium">{mod.name}</span>
                          </div>
                          {mod.priceInCents > 0 && (
                            <span className="text-sm text-muted-foreground">
                              +${(mod.priceInCents / 100).toFixed(2)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex items-center justify-between w-full text-sm text-muted-foreground border-t pt-3">
            <span>Base price</span>
            <span>${(menuItemPrice / 100).toFixed(2)}</span>
          </div>
          {extraCents > 0 && (
            <div className="flex items-center justify-between w-full text-sm text-muted-foreground">
              <span>Add-ons</span>
              <span>+${(extraCents / 100).toFixed(2)}</span>
            </div>
          )}
          {attempted && missingRequired.length > 0 && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Please select an option for: {missingRequired.map(l => l.name).join(", ")}
            </p>
          )}
          <Button
            onClick={handleConfirm}
            className="w-full mt-1"
            size="lg"
            disabled={isLoading}
          >
            Add to Cart — ${(totalCents / 100).toFixed(2)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
