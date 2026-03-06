import type { ToolDefinition } from "./types";
import { createSearchObservationsTool, createGetConversationSummariesTool } from "./analytics-conversation";
import { createGetToolUsageTool, createGetAgentPerformanceTool, createGetSessionStatsTool, createGetCostSummaryTool } from "./analytics-performance";
import { createGetErrorSummaryTool, createGetActivityTimelineTool, createGetUserActivityTool, createGetSubagentActivityTool } from "./analytics-operations";
import { createGetSessionAnalysisTool, createGetHealthDashboardTool, createGetRoutingStatsTool } from "./analytics-health";

// Re-export all individual tool factories
export { createSearchObservationsTool, createGetConversationSummariesTool } from "./analytics-conversation";
export { createGetToolUsageTool, createGetAgentPerformanceTool, createGetSessionStatsTool, createGetCostSummaryTool } from "./analytics-performance";
export { createGetErrorSummaryTool, createGetActivityTimelineTool, createGetUserActivityTool, createGetSubagentActivityTool } from "./analytics-operations";
export { createGetSessionAnalysisTool, createGetHealthDashboardTool, createGetRoutingStatsTool } from "./analytics-health";

export function createAnalyticsTools(agentId: string): ToolDefinition[] {
  return [
    createSearchObservationsTool(agentId),
    createGetConversationSummariesTool(),
    createGetToolUsageTool(),
    createGetAgentPerformanceTool(),
    createGetSessionStatsTool(),
    createGetCostSummaryTool(),
    createGetErrorSummaryTool(),
    createGetActivityTimelineTool(),
    createGetUserActivityTool(),
    createGetSubagentActivityTool(),
    createGetSessionAnalysisTool(),
    createGetHealthDashboardTool(),
    createGetRoutingStatsTool(),
  ];
}
