import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Settings2,
  ListChecks,
  ToggleLeft,
  Square,
} from "lucide-react";

type ModifierOption = {
  id: number;
  name: string;
  priceInCents: number;
  isSquareSynced: boolean;
};

type ModifierListData = {
  id: number;
  linkId: number;
  name: string;
  selectionType: "SINGLE" | "MULTIPLE";
  isEnabled: boolean;
  isSquareSynced: boolean;
  options: ModifierOption[];
};

function OptionRow({
  option,
  listId,
  menuItemId,
}: {
  option: ModifierOption;
  listId: number;
  menuItemId: number;
}) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(option.name);
  const [editPrice, setEditPrice] = useState((option.priceInCents / 100).toFixed(2));
  const [deleting, setDeleting] = useState(false);

  const updateOption = trpc.menu.updateModifierOption.useMutation({
    onSuccess: () => {
      toast.success("Option updated");
      utils.menu.getModifiersAdmin.invalidate({ menuItemId });
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteOption = trpc.menu.deleteModifierOption.useMutation({
    onSuccess: () => {
      toast.success("Option removed");
      utils.menu.getModifiersAdmin.invalidate({ menuItemId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (deleting) {
    return (
      <div className="flex items-center gap-2 py-1.5 px-2 bg-destructive/10 rounded-md">
        <span className="text-xs text-destructive flex-1">Remove "{option.name}"?</span>
        <Button
          size="sm"
          variant="destructive"
          className="h-6 text-xs px-2"
          onClick={() => deleteOption.mutate({ id: option.id })}
          disabled={deleteOption.isPending}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setDeleting(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 py-1">
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="h-7 text-xs flex-1"
          placeholder="Option name"
        />
        <Input
          value={editPrice}
          onChange={(e) => setEditPrice(e.target.value)}
          className="h-7 text-xs w-20"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
        />
        <Button
          size="sm"
          className="h-7 text-xs px-2 bg-[#DC2626] hover:bg-[#DC2626]/90"
          onClick={() =>
            updateOption.mutate({
              id: option.id,
              name: editName.trim(),
              priceInCents: Math.round(parseFloat(editPrice || "0") * 100),
            })
          }
          disabled={updateOption.isPending || !editName.trim()}
        >
          <Check className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditing(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 group">
      <span className="text-xs flex-1 text-foreground">{option.name}</span>
      {option.priceInCents > 0 && (
        <span className="text-xs text-muted-foreground">+${(option.priceInCents / 100).toFixed(2)}</span>
      )}
      {option.isSquareSynced && (
        <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">Square</Badge>
      )}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => {
            setEditName(option.name);
            setEditPrice((option.priceInCents / 100).toFixed(2));
            setEditing(true);
          }}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => setDeleting(true)}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function ModifierListCard({
  list,
  menuItemId,
}: {
  list: ModifierListData;
  menuItemId: number;
}) {
  const utils = trpc.useUtils();
  const [editingList, setEditingList] = useState(false);
  const [editName, setEditName] = useState(list.name);
  const [editType, setEditType] = useState<"SINGLE" | "MULTIPLE">(list.selectionType);
  const [deletingList, setDeletingList] = useState(false);
  const [addingOption, setAddingOption] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionPrice, setNewOptionPrice] = useState("0.00");

  const updateList = trpc.menu.updateModifierList.useMutation({
    onSuccess: () => {
      toast.success("Modifier list updated");
      utils.menu.getModifiersAdmin.invalidate({ menuItemId });
      setEditingList(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteList = trpc.menu.deleteModifierList.useMutation({
    onSuccess: () => {
      toast.success("Modifier list deleted");
      utils.menu.getModifiersAdmin.invalidate({ menuItemId });
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleEnabled = trpc.menu.toggleModifierListEnabled.useMutation({
    onSuccess: () => {
      utils.menu.getModifiersAdmin.invalidate({ menuItemId });
    },
    onError: (e) => toast.error(e.message),
  });

  const createOption = trpc.menu.createModifierOption.useMutation({
    onSuccess: () => {
      toast.success("Option added");
      utils.menu.getModifiersAdmin.invalidate({ menuItemId });
      setNewOptionName("");
      setNewOptionPrice("0.00");
      setAddingOption(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${!list.isEnabled ? "opacity-60 border-dashed" : ""}`}>
      {/* List header */}
      {deletingList ? (
        <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded-md">
          <span className="text-xs text-destructive flex-1">Delete "{list.name}" and all its options?</span>
          <Button
            size="sm"
            variant="destructive"
            className="h-6 text-xs px-2"
            onClick={() => deleteList.mutate({ id: list.id })}
            disabled={deleteList.isPending}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setDeletingList(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : editingList ? (
        <div className="flex items-center gap-1.5">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="h-7 text-xs flex-1"
            placeholder="List name"
          />
          <Select value={editType} onValueChange={(v) => setEditType(v as "SINGLE" | "MULTIPLE")}>
            <SelectTrigger className="h-7 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SINGLE">Single</SelectItem>
              <SelectItem value="MULTIPLE">Multiple</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-7 text-xs px-2 bg-[#DC2626] hover:bg-[#DC2626]/90"
            onClick={() => updateList.mutate({ id: list.id, name: editName.trim(), selectionType: editType })}
            disabled={updateList.isPending || !editName.trim()}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingList(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {list.selectionType === "SINGLE" ? (
              <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ListChecks className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="text-sm font-medium truncate">{list.name}</span>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 shrink-0 ${
                list.selectionType === "SINGLE"
                  ? "text-blue-600 border-blue-200 bg-blue-50"
                  : "text-purple-600 border-purple-200 bg-purple-50"
              }`}
            >
              {list.selectionType === "SINGLE" ? "Pick one" : "Multi-select"}
            </Badge>
            {list.isSquareSynced && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground shrink-0">Square</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Switch
              checked={list.isEnabled}
              onCheckedChange={(v) => toggleEnabled.mutate({ linkId: list.linkId, isEnabled: v })}
              className="scale-75"
            />
            <button
              onClick={() => { setEditName(list.name); setEditType(list.selectionType); setEditingList(true); }}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => setDeletingList(true)}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Options list */}
      {!deletingList && (
        <div className="pl-1 space-y-0.5">
          {list.options.length === 0 && !addingOption && (
            <p className="text-xs text-muted-foreground italic px-2 py-1">No options yet — add one below.</p>
          )}
          {list.options.map((opt) => (
            <OptionRow key={opt.id} option={opt} listId={list.id} menuItemId={menuItemId} />
          ))}

          {/* Add option form */}
          {addingOption ? (
            <div className="flex items-center gap-1.5 pt-1">
              <Input
                value={newOptionName}
                onChange={(e) => setNewOptionName(e.target.value)}
                className="h-7 text-xs flex-1"
                placeholder="Option name (e.g. Hot)"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newOptionName.trim()) {
                    createOption.mutate({
                      modifierListId: list.id,
                      name: newOptionName.trim(),
                      priceInCents: Math.round(parseFloat(newOptionPrice || "0") * 100),
                    });
                  }
                }}
              />
              <Input
                value={newOptionPrice}
                onChange={(e) => setNewOptionPrice(e.target.value)}
                className="h-7 text-xs w-20"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
              />
              <Button
                size="sm"
                className="h-7 text-xs px-2 bg-[#DC2626] hover:bg-[#DC2626]/90"
                onClick={() =>
                  createOption.mutate({
                    modifierListId: list.id,
                    name: newOptionName.trim(),
                    priceInCents: Math.round(parseFloat(newOptionPrice || "0") * 100),
                  })
                }
                disabled={createOption.isPending || !newOptionName.trim()}
              >
                <Check className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setAddingOption(false); setNewOptionName(""); setNewOptionPrice("0.00"); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setAddingOption(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1 px-2 py-1 rounded hover:bg-muted transition-colors"
            >
              <Plus className="h-3 w-3" /> Add option
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ModifierManager({ menuItemId }: { menuItemId: number }) {
  const [expanded, setExpanded] = useState(false);
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListType, setNewListType] = useState<"SINGLE" | "MULTIPLE">("SINGLE");
  const utils = trpc.useUtils();

  const { data: lists, isLoading } = trpc.menu.getModifiersAdmin.useQuery(
    { menuItemId },
    { enabled: expanded }
  );

  const createList = trpc.menu.createModifierList.useMutation({
    onSuccess: () => {
      toast.success("Modifier list created");
      utils.menu.getModifiersAdmin.invalidate({ menuItemId });
      setNewListName("");
      setNewListType("SINGLE");
      setAddingList(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mt-3 border-t pt-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="font-medium">Modifiers</span>
        {lists && lists.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{lists.length}</Badge>
        )}
        {expanded ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {isLoading && (
            <p className="text-xs text-muted-foreground">Loading modifiers...</p>
          )}

          {lists && lists.length === 0 && !addingList && (
            <p className="text-xs text-muted-foreground italic">No modifier lists yet. Add one to let customers customise this item.</p>
          )}

          {lists && lists.map((list) => (
            <ModifierListCard key={list.id} list={list as ModifierListData} menuItemId={menuItemId} />
          ))}

          {/* Add new modifier list */}
          {addingList ? (
            <div className="border border-dashed rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">New modifier list</p>
              <Input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                className="h-8 text-xs"
                placeholder="e.g. Spice Level, Extras, Size"
                autoFocus
              />
              <div className="flex gap-2">
                <Select value={newListType} onValueChange={(v) => setNewListType(v as "SINGLE" | "MULTIPLE")}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE">
                      <span className="flex items-center gap-1.5">
                        <ToggleLeft className="h-3.5 w-3.5" /> Pick one (Single)
                      </span>
                    </SelectItem>
                    <SelectItem value="MULTIPLE">
                      <span className="flex items-center gap-1.5">
                        <ListChecks className="h-3.5 w-3.5" /> Pick many (Multiple)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs flex-1 bg-[#DC2626] hover:bg-[#DC2626]/90"
                  onClick={() => createList.mutate({ menuItemId, name: newListName.trim(), selectionType: newListType })}
                  disabled={createList.isPending || !newListName.trim()}
                >
                  <Check className="h-3 w-3 mr-1" /> Create list
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => { setAddingList(false); setNewListName(""); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs w-full gap-1"
              onClick={() => setAddingList(true)}
            >
              <Plus className="h-3 w-3" /> Add modifier list
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
