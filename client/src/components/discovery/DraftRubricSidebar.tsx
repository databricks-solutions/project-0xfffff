import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Trash2, Plus, Sparkles, Check, X, Pencil } from 'lucide-react';
import {
  useCreateDraftRubricItem,
  useUpdateDraftRubricItem,
  useDeleteDraftRubricItem,
  useSuggestGroups,
  useApplyGroups,
} from '@/hooks/useWorkshopApi';
import type { DraftRubricItem } from '@/client/models/DraftRubricItem';
import type { ProposedGroup } from '@/client/models/ProposedGroup';

interface DraftRubricSidebarProps {
  items: DraftRubricItem[];
  workshopId: string;
  userId: string;
  onCreateRubric: () => void;
  newItemIds?: Set<string>;
  onFocusWithinChange?: (isFocused: boolean) => void;
}

const CREATE_GROUP_OPTION = '__create_new_group__';

export const DraftRubricSidebar: React.FC<DraftRubricSidebarProps> = ({
  items,
  workshopId,
  userId,
  onCreateRubric,
  newItemIds = new Set(),
  onFocusWithinChange,
}) => {
  const createMutation = useCreateDraftRubricItem(workshopId);
  const updateMutation = useUpdateDraftRubricItem(workshopId);
  const deleteMutation = useDeleteDraftRubricItem(workshopId);
  const suggestMutation = useSuggestGroups(workshopId);
  const applyMutation = useApplyGroups(workshopId);

  const [newItemText, setNewItemText] = React.useState('');
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState('');
  const [proposedGroups, setProposedGroups] = React.useState<ProposedGroup[] | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const groupsByName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.group_name && item.group_id && !map.has(item.group_name)) {
        map.set(item.group_name, item.group_id);
      }
    }
    return map;
  }, [items]);

  const groupNames = React.useMemo(() => Array.from(groupsByName.keys()).sort(), [groupsByName]);

  const createManualGroupId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `manual-${crypto.randomUUID()}`;
    }
    return `manual-${Date.now()}`;
  };

  const handleCreate = () => {
    if (!newItemText.trim()) return;
    createMutation.mutate(
      { text: newItemText.trim(), source_type: 'manual', promoted_by: userId },
      {
        onSuccess: () => {
          setNewItemText('');
          setShowAddForm(false);
        },
      }
    );
  };

  const handleUpdate = (itemId: string) => {
    if (!editText.trim()) return;
    updateMutation.mutate(
      { itemId, updates: { text: editText.trim() } },
      { onSuccess: () => setEditingId(null) }
    );
  };

  const handleDelete = (itemId: string) => {
    deleteMutation.mutate(itemId);
  };

  const handleSuggestGroups = () => {
    suggestMutation.mutate(undefined, {
      onSuccess: (data) => {
        setProposedGroups(data.groups || []);
      },
    });
  };

  const handleApplyGroups = () => {
    if (!proposedGroups) return;
    const groupsPayload = proposedGroups.map((g) => ({
      name: g.name,
      item_ids: g.item_ids,
    }));
    applyMutation.mutate(groupsPayload, {
      onSuccess: () => setProposedGroups(null),
    });
  };

  const startEdit = (item: DraftRubricItem) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const assignItemToGroup = (item: DraftRubricItem, groupName: string | null) => {
    if (!groupName) {
      updateMutation.mutate({
        itemId: item.id,
        updates: { group_id: null, group_name: null },
      });
      return;
    }

    const existingGroupId = groupsByName.get(groupName) ?? createManualGroupId();
    updateMutation.mutate({
      itemId: item.id,
      updates: {
        group_id: existingGroupId,
        group_name: groupName,
      },
    });
  };

  const handleGroupSelection = (item: DraftRubricItem, value: string) => {
    if (value === CREATE_GROUP_OPTION) {
      const groupName = window.prompt('Enter a name for the new group');
      if (!groupName || !groupName.trim()) return;
      assignItemToGroup(item, groupName.trim());
      return;
    }

    if (value === '') {
      assignItemToGroup(item, null);
      return;
    }

    assignItemToGroup(item, value);
  };

  const handleRenameGroup = (groupName: string, groupItems: DraftRubricItem[]) => {
    if (groupItems.length === 0) return;
    const renamed = window.prompt('Rename group', groupName);
    if (!renamed || !renamed.trim()) return;
    const nextName = renamed.trim();
    if (nextName === groupName) return;

    const groupId = groupItems[0].group_id ?? createManualGroupId();
    for (const item of groupItems) {
      updateMutation.mutate({
        itemId: item.id,
        updates: { group_id: groupId, group_name: nextName },
      });
    }
  };

  // Group items by group_name for display
  const grouped = React.useMemo(() => {
    const groups: Record<string, DraftRubricItem[]> = {};
    const ungrouped: DraftRubricItem[] = [];

    for (const item of items) {
      if (item.group_name && item.group_id) {
        if (!groups[item.group_name]) {
          groups[item.group_name] = [];
        }
        groups[item.group_name].push(item);
      } else {
        ungrouped.push(item);
      }
    }

    return { groups, ungrouped };
  }, [items]);

  const groupCount = Object.keys(grouped.groups).length;

  const renderTraceBadges = (item: DraftRubricItem) => {
    if (!item.source_trace_ids || item.source_trace_ids.length === 0) return null;
    return (
      <>
        {item.source_trace_ids.slice(0, 3).map((tid) => (
          <Badge key={tid} variant="outline" className="text-xs font-mono">
            {tid.slice(0, 8)}
          </Badge>
        ))}
        {item.source_trace_ids.length > 3 && (
          <Badge variant="outline" className="text-xs">
            +{item.source_trace_ids.length - 3} more
          </Badge>
        )}
      </>
    );
  };

  const renderItem = (item: DraftRubricItem) => {
    const isEditing = editingId === item.id;

    return (
      <div
        key={item.id}
        className={`border rounded p-3 bg-white hover:shadow-sm transition-shadow${newItemIds.has(item.id) ? ' draft-item-new' : ''}`}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          {isEditing ? (
            <div className="flex-1 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full text-sm border rounded p-2 min-h-[50px]"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleUpdate(item.id)}
                  disabled={updateMutation.isPending}
                  className="h-6 text-xs"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingId(null)}
                  className="h-6 text-xs"
                >
                  <X className="w-3 h-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-800 flex-1">{item.text}</p>
          )}
          {!isEditing && (
            <div className="flex gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startEdit(item)}
                className="h-6 w-6 p-0"
              >
                <Pencil className="w-3 h-3 text-slate-400" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(item.id)}
                disabled={deleteMutation.isPending}
                className="h-6 w-6 p-0"
              >
                <Trash2 className="w-3 h-3 text-red-400 hover:text-red-600" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {renderTraceBadges(item)}
        </div>

        <div className="mt-2">
          <select
            id={`group-select-${item.id}`}
            value={item.group_name ?? ''}
            onChange={(e) => handleGroupSelection(item, e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs bg-white"
          >
            <option value="">Ungrouped</option>
            {groupNames.map((gn) => (
              <option key={gn} value={gn}>
                {gn}
              </option>
            ))}
            <option value={CREATE_GROUP_OPTION}>+ Create new group...</option>
          </select>
        </div>
      </div>
    );
  };

  const notifyFocusWithinChange = React.useCallback((isFocused: boolean) => {
    onFocusWithinChange?.(isFocused);
  }, [onFocusWithinChange]);

  const handleFocusCapture = () => {
    notifyFocusWithinChange(true);
  };

  const handleBlurCapture = () => {
    window.setTimeout(() => {
      const root = rootRef.current;
      if (!root) return;
      const active = document.activeElement;
      if (!active || !root.contains(active)) {
        notifyFocusWithinChange(false);
      }
    }, 0);
  };

  React.useEffect(() => {
    return () => notifyFocusWithinChange(false);
  }, [notifyFocusWithinChange]);

  return (
    <div
      ref={rootRef}
      className="flex flex-col h-full"
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b bg-white">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            Draft Rubric
          </h3>
          <div className="flex gap-1">
            {items.length >= 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSuggestGroups}
                disabled={suggestMutation.isPending}
                className="h-7 text-xs"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                {suggestMutation.isPending ? 'Suggesting...' : 'Suggest Groups'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="h-7 text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          {items.length} items · {groupCount} group{groupCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Group proposal is shown first so facilitator sees it immediately */}
        {proposedGroups && (
          <div className="border border-blue-200 rounded bg-blue-50 p-3">
            <h4 className="text-xs font-semibold flex items-center gap-1 mb-2">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Suggested Grouping
            </h4>
            <div className="space-y-2">
              {proposedGroups.map((group, idx) => (
                <div key={idx} className="border rounded p-2 bg-white">
                  <h5 className="text-xs font-semibold text-slate-800 mb-1">{group.name}</h5>
                  <p className="text-xs text-slate-500 mb-1">{group.rationale}</p>
                  <div className="flex flex-wrap gap-1">
                    {group.item_ids.map((id) => {
                      const item = items.find((i) => i.id === id);
                      return item ? (
                        <Badge key={id} variant="outline" className="text-xs max-w-[160px] truncate">
                          {item.text}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleApplyGroups}
                disabled={applyMutation.isPending}
                className="h-7 text-xs"
              >
                {applyMutation.isPending ? 'Applying...' : 'Apply Groups'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setProposedGroups(null)}
                className="h-7 text-xs"
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Add form */}
        {showAddForm && (
          <div className="p-3 border rounded bg-slate-50">
            <textarea
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Enter draft rubric item text..."
              className="w-full text-sm border rounded p-2 min-h-[50px] mb-2"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={createMutation.isPending || !newItemText.trim()}
                className="h-7 text-xs"
              >
                {createMutation.isPending ? 'Adding...' : 'Add'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowAddForm(false); setNewItemText(''); }}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
            <p className="text-sm text-slate-600 mb-1">No items yet</p>
            <p className="text-xs text-slate-500">
              Promote findings from traces or add items manually.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Grouped items */}
            {Object.entries(grouped.groups).map(([groupName, groupItems]) => (
              <div key={groupName} className="space-y-2">
                <div className="flex items-center justify-between border-b pb-1">
                  <h4 className="text-xs font-semibold text-slate-700">
                    {groupName} ({groupItems.length})
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs"
                    onClick={() => handleRenameGroup(groupName, groupItems)}
                  >
                    Rename
                  </Button>
                </div>
                <div className="space-y-2 pl-1">
                  {groupItems.map(renderItem)}
                </div>
              </div>
            ))}

            {/* Ungrouped items */}
            {grouped.ungrouped.length > 0 && (
              <div className="space-y-2">
                {Object.keys(grouped.groups).length > 0 && (
                  <h4 className="text-xs font-semibold text-slate-500 border-b pb-1">
                    Ungrouped ({grouped.ungrouped.length})
                  </h4>
                )}
                <div className="space-y-2">
                  {grouped.ungrouped.map(renderItem)}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Sticky footer */}
      <div className="px-4 py-3 border-t bg-white">
        <Button
          onClick={onCreateRubric}
          disabled={items.length === 0}
          className="w-full"
          size="sm"
        >
          Create Rubric &rarr;
        </Button>
        {groupCount > 0 && (
          <p className="text-xs text-slate-500 text-center mt-1">
            Groups become criteria
          </p>
        )}
      </div>
    </div>
  );
};
