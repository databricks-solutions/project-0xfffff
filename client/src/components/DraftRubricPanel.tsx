import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Trash2, Plus, Sparkles, Check, X, Pencil } from 'lucide-react';
import {
  useDraftRubricItems,
  useCreateDraftRubricItem,
  useUpdateDraftRubricItem,
  useDeleteDraftRubricItem,
  useSuggestGroups,
  useApplyGroups,
} from '@/hooks/useWorkshopApi';
import type { DraftRubricItem } from '@/client/models/DraftRubricItem';
import type { ProposedGroup } from '@/client/models/ProposedGroup';

interface DraftRubricPanelProps {
  workshopId: string;
  userId: string;
}

const CREATE_GROUP_OPTION = '__create_new_group__';

const SOURCE_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  finding: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Analysis' },
  disagreement: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Disagreement' },
  feedback: { bg: 'bg-green-100', text: 'text-green-700', label: 'Feedback' },
  manual: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Manual' },
};

export const DraftRubricPanel: React.FC<DraftRubricPanelProps> = ({
  workshopId,
  userId,
}) => {
  const { data: items = [], isLoading } = useDraftRubricItems(workshopId);
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

  const renderSourceBadge = (item: DraftRubricItem) => {
    const style = SOURCE_TYPE_STYLES[item.source_type] || SOURCE_TYPE_STYLES.manual;
    return (
      <Badge className={`${style.bg} ${style.text} text-xs border-0`}>
        {style.label}
      </Badge>
    );
  };

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
        className="border rounded-lg p-4 bg-gradient-to-r from-slate-50 to-transparent hover:shadow-sm transition-shadow"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          {isEditing ? (
            <div className="flex-1 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full text-sm border rounded p-2 min-h-[60px]"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleUpdate(item.id)}
                  disabled={updateMutation.isPending}
                  className="h-7"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingId(null)}
                  className="h-7"
                >
                  <X className="w-3 h-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-800 font-medium flex-1">{item.text}</p>
          )}
          {!isEditing && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startEdit(item)}
                className="h-7 px-2"
              >
                <Pencil className="w-4 h-4 text-slate-400" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(item.id)}
                disabled={deleteMutation.isPending}
                className="h-7 px-2"
              >
                <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {renderSourceBadge(item)}
          {renderTraceBadges(item)}
        </div>
        <div className="mt-3">
          <label className="text-xs text-slate-600 block mb-1" htmlFor={`group-select-${item.id}`}>
            Assign item to group
          </label>
          <select
            id={`group-select-${item.id}`}
            value={item.group_name ?? ''}
            onChange={(e) => handleGroupSelection(item, e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">Ungrouped</option>
            {groupNames.map((groupName) => (
              <option key={groupName} value={groupName}>
                {groupName}
              </option>
            ))}
            <option value={CREATE_GROUP_OPTION}>+ Create new group...</option>
          </select>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-sm text-slate-500">Loading draft rubric items...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Draft Rubric Items ({items.length})
            </CardTitle>
            <div className="flex gap-2">
              {items.length >= 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSuggestGroups}
                  disabled={suggestMutation.isPending}
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  {suggestMutation.isPending ? 'Suggesting...' : 'Suggest Groups'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Add form */}
          {showAddForm && (
            <div className="mb-4 p-3 border rounded-lg bg-slate-50">
              <textarea
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder="Enter draft rubric item text..."
                className="w-full text-sm border rounded p-2 min-h-[60px] mb-2"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !newItemText.trim()}
                >
                  {createMutation.isPending ? 'Adding...' : 'Add'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowAddForm(false); setNewItemText(''); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-30 text-slate-400" />
              <p className="text-sm text-slate-600 mb-2">Draft Rubric Staging Area</p>
              <p className="text-xs text-slate-500">
                Promote findings, disagreements, or feedback to build your rubric.
                Or add items manually.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Grouped items */}
              {Object.entries(grouped.groups).map(([groupName, groupItems]) => (
                <div key={groupName} className="space-y-2">
                  <div className="flex items-center justify-between border-b pb-1">
                    <h4 className="text-sm font-semibold text-slate-700">
                      {groupName} ({groupItems.length})
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleRenameGroup(groupName, groupItems)}
                    >
                      Rename
                    </Button>
                  </div>
                  <div className="space-y-2 pl-2">
                    {groupItems.map(renderItem)}
                  </div>
                </div>
              ))}

              {/* Ungrouped items */}
              {grouped.ungrouped.length > 0 && (
                <div className="space-y-2">
                  {Object.keys(grouped.groups).length > 0 && (
                    <h4 className="text-sm font-semibold text-slate-500 border-b pb-1">
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
        </CardContent>
      </Card>

      {/* Group proposal overlay */}
      {proposedGroups && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Suggested Grouping
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {proposedGroups.map((group, idx) => (
                <div key={idx} className="border rounded p-3 bg-white">
                  <h5 className="text-sm font-semibold text-slate-800 mb-1">{group.name}</h5>
                  <p className="text-xs text-slate-500 mb-2">{group.rationale}</p>
                  <div className="flex flex-wrap gap-1">
                    {group.item_ids.map((id) => {
                      const item = items.find((i) => i.id === id);
                      return item ? (
                        <Badge key={id} variant="outline" className="text-xs max-w-[200px] truncate">
                          {item.text}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                size="sm"
                onClick={handleApplyGroups}
                disabled={applyMutation.isPending}
              >
                {applyMutation.isPending ? 'Applying...' : 'Apply Groups'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setProposedGroups(null)}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
