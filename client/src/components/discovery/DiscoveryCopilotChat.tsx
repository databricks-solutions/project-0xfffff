import React from 'react';
import {
  CopilotChat,
  useAgentContext,
  useConfigureSuggestions,
} from '@copilotkit/react-core/v2';
import { CopilotKit } from '@copilotkit/react-core';

interface DiscoveryCopilotChatProps {
  workshopId: string;
  traceId: string;
  userId: string;
  milestoneRef: string | null;
}

export const DiscoveryCopilotChat: React.FC<DiscoveryCopilotChatProps> = ({
  workshopId,
  traceId,
  userId,
  milestoneRef,
}) => {
  const runtimeUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set('user_id', userId);
    if (milestoneRef) params.set('milestone_ref', milestoneRef);
    return `/workshops/${workshopId}/traces/${traceId}/ag-ui/thread-assistant?${params.toString()}`;
  }, [workshopId, traceId, userId, milestoneRef]);

  return (
    <CopilotKit runtimeUrl={runtimeUrl} showDevConsole={false} agent="thread_assistant">
      <DiscoveryCopilotChatInner
        userId={userId}
        traceId={traceId}
        milestoneRef={milestoneRef}
      />
    </CopilotKit>
  );
};

const DiscoveryCopilotChatInner = ({
  userId,
  traceId,
  milestoneRef,
}: {
  userId: string;
  traceId: string;
  milestoneRef: string | null;
}) => {
  useAgentContext({
    description: 'Current discovery user id',
    value: userId,
  });
  useAgentContext({
    description: 'Current trace id',
    value: traceId,
  });
  useAgentContext({
    description: 'Current milestone reference',
    value: milestoneRef ?? 'all',
  });

  useConfigureSuggestions({
    suggestions: [
      {
        title: 'Summarize this milestone',
        message: 'Summarize the current milestone discussion and key disagreements.',
      },
      {
        title: 'Suggest rubric criteria',
        message: 'Propose 2 rubric criteria grounded in this thread and explain why.',
      },
    ],
    available: 'always',
  });

  return (
    <div className="h-full w-full rounded-xl border border-indigo-100 bg-white">
      <CopilotChat agentId="thread_assistant" className="h-full rounded-xl" />
    </div>
  );
};
