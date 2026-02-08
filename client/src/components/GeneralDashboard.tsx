import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  FileText,
  Star,
  BarChart3,
  LayoutDashboard,
  Eye,
  ChevronRight
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useAllTraces, useFacilitatorAnnotations } from '@/hooks/useWorkshopApi';
import { UsersService } from '@/client';
import { useQuery } from '@tanstack/react-query';
import { JsonPathSettings } from './JsonPathSettings';

interface GeneralDashboardProps {
  onNavigate?: (phase: string) => void;
}

export const GeneralDashboard: React.FC<GeneralDashboardProps> = ({ onNavigate }) => {
  const { workshopId } = useWorkshopContext();
  const { data: traces } = useAllTraces(workshopId!);
  const { data: annotations } = useFacilitatorAnnotations(workshopId!);

  // Fetch workshop users
  const { data: workshopUsers } = useQuery({
    queryKey: ['workshop-users', workshopId],
    queryFn: () => UsersService.listWorkshopUsersUsersWorkshopsWorkshopIdUsersGet(workshopId!),
    enabled: !!workshopId,
  });

  const totalTraces = traces?.length || 0;
  const totalAnnotations = annotations?.length || 0;
  const activeAnnotators = workshopUsers?.users?.length || 0;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900">
          <LayoutDashboard className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Workshop overview and management</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-500">Traces</span>
                <p className="text-2xl font-bold text-gray-900">{totalTraces}</p>
              </div>
              <FileText className="h-5 w-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-500">Annotations</span>
                <p className="text-2xl font-bold text-gray-900">{totalAnnotations}</p>
              </div>
              <Star className="h-5 w-5 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-500">Users</span>
                <p className="text-2xl font-bold text-gray-900">{activeAnnotators}</p>
              </div>
              <Users className="h-5 w-5 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Management Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <button
          onClick={() => onNavigate?.('user-management')}
          className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all text-left group"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50">
            <Users className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900">Invite Participants</div>
            <div className="text-xs text-gray-500">Add and manage workshop users</div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
        </button>

        <div className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 bg-white">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900">Phase Monitoring</div>
            <div className="text-xs text-gray-500">Monitor current phase progress</div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => onNavigate?.('discovery')}
              className="h-8"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              Discovery
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate?.('annotation')}
              className="h-8"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              Annotation
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Quick Actions</h3>
          <div className="grid md:grid-cols-3 gap-3">
            <Button
              variant="outline"
              onClick={() => onNavigate?.('intake')}
              className="h-auto py-3 justify-start gap-3"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-sm">Intake Phase</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => onNavigate?.('rubric')}
              className="h-auto py-3 justify-start gap-3"
            >
              <Star className="w-4 h-4 text-green-600" />
              <span className="text-sm">Rubric Creation</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => onNavigate?.('results')}
              className="h-auto py-3 justify-start gap-3"
            >
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <span className="text-sm">Results Review</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Trace Display Settings */}
      <JsonPathSettings />
    </div>
  );
};
