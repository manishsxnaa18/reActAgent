import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createIssue, updateIssueFields, assignIssueToSprint, searchIssues, summarizeIssueCountsByUser, findUsers, JiraIssueSummary, countIssues, JiraServiceError } from "../integrations/jiraService";

function stringifyError(error: unknown): string {
  if (error instanceof JiraServiceError) {
    const errorMessages = (error.details as any)?.errorMessages;
    const messagesText = Array.isArray(errorMessages) && errorMessages.length
      ? ` Error messages: ${errorMessages.join(" | ")}`
      : "";
    const detailText = error.details ? ` Details: ${JSON.stringify(error.details)}` : "";
    const statusText = error.status ? ` (status ${error.status})` : "";
    return `${error.message}${statusText}${messagesText}${detailText}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function resolveJiraUser(identifier: string) {
  const normalized = identifier.trim();
  if (!normalized) {
    throw new Error("Contact name or email is required to resolve a Jira user.");
  }

  const matches = await findUsers(normalized);

  if (!matches.length) {
    throw new Error(`I could not find a Jira user matching "${identifier}".`);
  }

  const emailTarget = normalized.includes("@") ? normalized.toLowerCase() : undefined;
  if (emailTarget) {
    const exactEmail = matches.find((user) => user.emailAddress?.toLowerCase() === emailTarget);
    if (exactEmail) {
      return exactEmail;
    }
  }

  if (matches.length === 1) {
    return matches[0];
  }

  const sameName = matches.find((user) => user.displayName.toLowerCase() === normalized.toLowerCase());
  if (sameName) {
    return sameName;
  }

  throw new Error(`Multiple Jira users matched "${identifier}". Please provide an email address.`);
}

export const createJiraIssueTool = new DynamicStructuredTool({
  name: "create_jira_issue",
  description: "Create a Jira issue with optional description, assignee, reporter, priority, and labels.",
  schema: z.object({
    projectKey: z.string().optional(),
    title: z.string().min(3),
    description: z.string().optional(),
    issueType: z.string().optional(),
    reporter: z.string().optional(),
    assignee: z.string().optional(),
    priority: z.string().optional(),
    labels: z.array(z.string()).optional()
  }) as any,

  func: async (input: any) => {
    try {
      const { projectKey, title, description, issueType, reporter, assignee, priority, labels } = input;
      const reporterUser = reporter ? await resolveJiraUser(reporter) : undefined;
      const assigneeUser = assignee ? await resolveJiraUser(assignee) : undefined;

      const issue = await createIssue({
        projectKey,
        summary: title,
        description,
        issueType,
        reporterId: reporterUser?.accountId,
        assigneeId: assigneeUser?.accountId,
        priority,
        labels
      });

      return `Created Jira issue ${issue.key}. ${issue.selfUrl}`;
    } catch (error) {
      return stringifyError(error);
    }
  }
} as any);

export const updateJiraIssueTool = new DynamicStructuredTool({
  name: "update_jira_issue",
  description: "Update Jira issue fields (summary, description, reporter, assignee, priority, labels, sprint).",
  schema: z.object({
    issueKey: z.string().describe("Jira issue key, e.g., OPS-123"),
    summary: z.string().optional(),
    description: z.string().optional(),
    reporter: z.string().optional(),
    assignee: z.string().optional(),
    priority: z.string().optional(),
    labels: z.array(z.string()).optional(),
    sprintId: z.number().optional().describe("Sprint ID to move the issue into")
  }) as any,
  func: async (input: any) => {
    try {
      const { issueKey, summary, description, reporter, assignee, priority, labels, sprintId } = input;
      const updates: {
        summary?: string;
        description?: string;
        reporterId?: string;
        assigneeId?: string;
        priority?: string;
        labels?: string[];
      } = {};

      if (summary) updates.summary = summary;
      if (description) updates.description = description;
      if (priority) updates.priority = priority;
      if (labels) updates.labels = labels;
      if (reporter) {
        updates.reporterId = (await resolveJiraUser(reporter)).accountId;
      }
      if (assignee) {
        updates.assigneeId = (await resolveJiraUser(assignee)).accountId;
      }

      if (Object.keys(updates).length > 0) {
        await updateIssueFields(issueKey, updates);
      }

      if (sprintId) {
        await assignIssueToSprint(issueKey, sprintId);
      }

      return `Updated ${issueKey}.`;
    } catch (error) {
      return stringifyError(error);
    }
  }
} as any);

function summarizeIssues(issues: JiraIssueSummary[]): string {
  if (issues.length === 0) {
    return "No matching Jira issues were found.";
  }

  return issues
    .map((issue) => `- ${issue.key}: ${issue.summary} (Status: ${issue.status}, Updated: ${new Date(issue.updated).toLocaleDateString()}) — ${issue.url}`)
    .join("\n");
}

function summarizeIssuesWithAssignee(issues: JiraIssueSummary[]): string {
  if (issues.length === 0) {
    return "No matching Jira issues were found.";
  }

  return issues
    .map((issue) => `- ${issue.key}: ${issue.summary} (Status: ${issue.status}, Assignee: ${issue.assignee || "Unassigned"}, Updated: ${new Date(issue.updated).toLocaleDateString()}) — ${issue.url}`)
    .join("\n");
}

export const listJiraIssuesTool = new DynamicStructuredTool({
  name: "list_jira_issues",
  description: "List Jira issues for a person (assignee or reporter) with optional status and current sprint filters.",
  schema: z.object({
    person: z.string().describe("Name or email of the person"),
    role: z.enum(["assignee", "reporter"]).optional().default("assignee"),
    statuses: z.array(z.string().min(2)).optional().describe("List of Jira statuses to filter by"),
    sprintId: z.number().optional().describe("Sprint ID to filter"),
    currentSprint: z.boolean().optional().describe("Filter by current active sprint"),
    limit: z.number().int().min(1).max(50).optional()
  }) as any,
  func: async (input: any) => {
    try {
      const { person, role, statuses, sprintId, currentSprint, limit } = input;
      //console.log("listJiraIssuesTool:input", { input });
      const user = await resolveJiraUser(person);
 //console.log("listJiraIssuesTool:input", { user });
      const issues = await searchIssues({
        userRole: role || "assignee",
        userAccountId: user.accountId,
        statuses,
        sprintId,
        currentSprint,
        limit
      });

      //console.log("listJiraIssuesTool:issues", { issues });

      return summarizeIssues(issues);
    } catch (error) {
       //console.log("listJiraIssuesTool:error", { error });
      return stringifyError(error);
    }
  }
} as any);

export const listJiraIssuesAllTool = new DynamicStructuredTool({
  name: "list_jira_issues_all",
  description: "List Jira issues for all users with optional status and sprint filters.",
  schema: z.object({
    statuses: z.array(z.string().min(2)).optional().describe("List of Jira statuses to filter by"),
    sprintId: z.number().optional().describe("Sprint ID to filter"),
    currentSprint: z.boolean().optional().describe("Filter by current active sprint"),
    limit: z.number().int().min(1).max(200).optional()
  }) as any,
  func: async (input: any) => {
    try {
      const { statuses, sprintId, currentSprint, limit } = input;
      const issues = await searchIssues({
        statuses,
        sprintId,
        currentSprint,
        limit
      });

      return summarizeIssuesWithAssignee(issues);
    } catch (error) {
      return stringifyError(error);
    }
  }
} as any);

export const jiraIssueCountsTool = new DynamicStructuredTool({
  name: "jira_issue_counts",
  description: "Count Jira issues for one or more people with optional status and sprint filters.",
  schema: z.object({
    people: z.array(z.string().min(2)).min(1).describe("List of names or emails (use a single item for one person)"),
    statuses: z.array(z.string().min(2)).optional().describe("List of Jira statuses to filter by"),
    role: z.enum(["assignee", "reporter"]).optional().default("assignee"),
    sprintId: z.number().optional().describe("Sprint ID to filter"),
    currentSprint: z.boolean().optional().describe("Filter by current active sprint")
  }) as any,
  func: async (input: any) => {
    try {
      const { people, statuses, role, sprintId, currentSprint } = input;
 console.log("jiraIssueCountsTool:input", { input });
      
      const users = await Promise.all(people.map(resolveJiraUser));

      const counts = await Promise.all(
        users.map(async (user) => {
          const total = await countIssues({
            userRole: role || "assignee",
            userAccountId: user.accountId,
            statuses,
            sprintId,
            currentSprint
          });
          return { user, count: total };
        })
      );
       console.log("jiraIssueCountsTool:counts", { counts });

      const summaryLines = counts.map((entry, idx) => {
        const requested = people[idx] ?? entry.user.displayName;
        const label = entry.user.displayName || requested;
        return `${label} — ${entry.count} issues`;
      });

      return summaryLines.join("\n");
    } catch (error) {
      console.log("jiraIssueCountsTool:error", {error});
      return stringifyError(error);
    }
  }
} as any);
