import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Trash2, Copy, Check } from 'lucide-react';

interface DraftRubricItem {
  id: string;
  text: string;
  source_trace_id: string;
  promoted_by: string;
  promoted_at?: string;
}

interface DraftRubricPanelProps {
  items: DraftRubricItem[];
  onRemove?: (itemId: string) => void;
  onCopyText?: (text: string) => void;
}

export const DraftRubricPanel: React.FC<DraftRubricPanelProps> = ({
  items = [],
  onRemove,
  onCopyText,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopy = (itemId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(itemId);
    setTimeout(() => setCopiedId(null), 2000);
    onCopyText?.(text);
  };

  if (items.length === 0) {
    return (
      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-30 text-slate-400" />
            <p className="text-sm text-slate-600 mb-2">Draft Rubric Staging Area</p>
            <p className="text-xs text-slate-500">
              Promoted findings will appear here as candidates for rubric items
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Draft Rubric Items ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="border rounded-lg p-4 bg-gradient-to-r from-slate-50 to-transparent hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-sm text-slate-800 font-medium flex-1">{item.text}</p>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(item.id, item.text)}
                    className="h-7 px-2"
                  >
                    {copiedId === item.id ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-400" />
                    )}
                  </Button>
                  {onRemove && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemove(item.id)}
                      className="h-7 px-2"
                    >
                      <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">
                  Source: {item.source_trace_id.slice(0, 8)}...
                </Badge>
                <Badge variant="outline" className="text-xs">
                  By: {item.promoted_by}
                </Badge>
                {item.promoted_at && (
                  <Badge variant="outline" className="text-xs">
                    {new Date(item.promoted_at).toLocaleDateString()}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-slate-600">
            💡 These items are candidates for your rubric. Review and refine them before finalizing your evaluation criteria.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
