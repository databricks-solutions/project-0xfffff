import React from 'react';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RoleBasedWorkflow } from '@/components/RoleBasedWorkflow';
import { ChevronDown, LogOut, Settings, User, PanelLeftClose } from 'lucide-react';
import appIcon from '../../assets/favicon-48x48.png';

interface AppSidebarProps {
  onNavigate: (phase: string) => void;
  showUserSwitching?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AppSidebar({ onNavigate, showUserSwitching = false, collapsed = false, onToggleCollapse }: AppSidebarProps) {
  const { user, setUser } = useUser();
  const { isFacilitator, isSME } = useRoleCheck();

  const getUserInitials = () => {
    if (!user?.name) return 'U';
    return user.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleColor = () => {
    if (isFacilitator) return 'from-cyan-500 to-teal-600';
    if (isSME) return 'from-purple-500 to-blue-600';
    return 'from-yellow-500 to-red-600';
  };

  const getRoleBadgeColor = () => {
    if (isFacilitator) return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    if (isSME) return 'bg-purple-100 text-purple-700 border-purple-200';
    return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  };

  return (
    <div className={`flex h-screen flex-col border-r bg-background transition-all duration-300 ${collapsed ? 'w-0 overflow-hidden border-r-0' : 'w-64'}`}>
      {/* Logo Section */}
      <div className="flex h-14 items-center justify-between border-b px-5 min-w-[16rem]">
        <div className="flex items-center gap-2.5">
          <img src={appIcon} alt="LLM Workshop" className="h-8 w-8 rounded-lg" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-none text-gray-900">LLM Judge Workshop</span>
            <span className="text-[11px] text-gray-500 mt-0.5">Calibration Tool</span>
          </div>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Workflow Steps - Scrollable */}
      <ScrollArea className="flex-1 px-3 py-4">
        <RoleBasedWorkflow onNavigate={onNavigate} />
      </ScrollArea>

      <Separator />

      {/* User Profile Section */}
      <div className="p-3 bg-gray-50/50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-3 py-3 h-auto hover:bg-white hover:shadow-sm transition-all rounded-lg border border-transparent hover:border-gray-200"
            >
              <Avatar className="h-10 w-10 ring-2 ring-white shadow-sm">
                <AvatarFallback className={`bg-gradient-to-br ${getRoleColor()} text-sm font-bold text-white`}>
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col items-start text-left gap-1.5">
                <span className="text-sm font-semibold text-gray-900">{user?.name || 'User'}</span>
                <Badge
                  variant="secondary"
                  className={`text-[10px] font-semibold px-2 py-0 h-5 ${getRoleBadgeColor()}`}
                >
                  {user?.role || 'Participant'}
                </Badge>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1.5">
                <p className="text-sm font-semibold leading-none text-gray-900">{user?.name || 'User'}</p>
                <p className="text-xs leading-none text-gray-500 font-medium">
                  {user?.email || 'No email'}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-gray-400">
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled className="text-gray-400">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            {showUserSwitching && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setUser(null)} className="text-gray-700 hover:text-gray-900">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Switch User</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
