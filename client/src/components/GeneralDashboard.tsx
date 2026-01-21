import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  FileText,
  Star,
  BarChart3,
  Settings,
  Plus,
  Eye
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
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
          <Settings className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Workshop Management Dashboard</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Overview and management tools for your workshop
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Total Traces</p>
                <p className="text-2xl font-bold text-blue-900">{totalTraces}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Total Annotations</p>
                <p className="text-2xl font-bold text-green-900">{totalAnnotations}</p>
              </div>
              <Star className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Workshop Users</p>
                <p className="text-2xl font-bold text-purple-900">{activeAnnotators}</p>
              </div>
              <Users className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Management Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              User Management
            </CardTitle>
            <CardDescription>
              Add and manage workshop participants
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => onNavigate?.('user-management')}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Manage Users
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-600" />
              Phase Monitoring
            </CardTitle>
            <CardDescription>
              Monitor current phase progress
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline"
              onClick={() => onNavigate?.('discovery')}
              className="w-full justify-start"
            >
              <Eye className="w-4 h-4 mr-2" />
              Discovery Phase
            </Button>
            <Button 
              variant="outline"
              onClick={() => onNavigate?.('annotation')}
              className="w-full justify-start"
            >
              <Eye className="w-4 h-4 mr-2" />
              Annotation Phase
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common workshop management tasks
          </CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <Button variant="outline" onClick={() => onNavigate?.('intake')}>
            <FileText className="w-4 h-4 mr-2" />
            Intake Phase
          </Button>
          <Button variant="outline" onClick={() => onNavigate?.('rubric')}>
            <Star className="w-4 h-4 mr-2" />
            Rubric Creation
          </Button>
          <Button variant="outline" onClick={() => onNavigate?.('results')}>
            <BarChart3 className="w-4 h-4 mr-2" />
            Results Review
          </Button>
        </CardContent>
      </Card>

      {/* Trace Display Settings */}
      <JsonPathSettings />
    </div>
  );
};
