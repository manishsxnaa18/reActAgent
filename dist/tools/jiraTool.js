"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jiraIssueCountsTool = exports.listJiraIssuesAllTool = exports.listJiraIssuesTool = exports.updateJiraIssueTool = exports.createJiraIssueTool = void 0;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const jiraService_1 = require("../integrations/jiraService");
function stringifyError(error) {
    if (error instanceof jiraService_1.JiraServiceError) {
        const errorMessages = error.details?.errorMessages;
        const messagesText = Array.isArray(errorMessages) && errorMessages.length
            ? ` Error messages: ${errorMessages.join(" | ")}`
            : "";
        const detailText = error.details ? ` Details: ${JSON.stringify(error.details)}` : "";
        const statusText = error.status ? ` (status ${error.status})` : "";
        return `${error.message}${statusText}${messagesText}${detailText}`;
    }
    return error instanceof Error ? error.message : String(error);
}
async function resolveJiraUser(identifier) {
    const normalized = identifier.trim();
    if (!normalized) {
        throw new Error("Contact name or email is required to resolve a Jira user.");
    }
    const matches = await (0, jiraService_1.findUsers)(normalized);
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
exports.createJiraIssueTool = new tools_1.DynamicStructuredTool({
    name: "create_jira_issue",
    description: "Create a Jira issue with optional description, assignee, reporter, priority, and labels.",
    schema: zod_1.z.object({
        projectKey: zod_1.z.string().optional(),
        title: zod_1.z.string().min(3),
        description: zod_1.z.string().optional(),
        issueType: zod_1.z.string().optional(),
        reporter: zod_1.z.string().optional(),
        assignee: zod_1.z.string().optional(),
        priority: zod_1.z.string().optional(),
        labels: zod_1.z.array(zod_1.z.string()).optional()
    }),
    func: async (input) => {
        try {
            const { projectKey, title, description, issueType, reporter, assignee, priority, labels } = input;
            const reporterUser = reporter ? await resolveJiraUser(reporter) : undefined;
            const assigneeUser = assignee ? await resolveJiraUser(assignee) : undefined;
            const issue = await (0, jiraService_1.createIssue)({
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
        }
        catch (error) {
            return stringifyError(error);
        }
    }
});
exports.updateJiraIssueTool = new tools_1.DynamicStructuredTool({
    name: "update_jira_issue",
    description: "Update Jira issue fields (summary, description, reporter, assignee, priority, labels, sprint).",
    schema: zod_1.z.object({
        issueKey: zod_1.z.string().describe("Jira issue key, e.g., OPS-123"),
        summary: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        reporter: zod_1.z.string().optional(),
        assignee: zod_1.z.string().optional(),
        priority: zod_1.z.string().optional(),
        labels: zod_1.z.array(zod_1.z.string()).optional(),
        sprintId: zod_1.z.number().optional().describe("Sprint ID to move the issue into")
    }),
    func: async (input) => {
        try {
            const { issueKey, summary, description, reporter, assignee, priority, labels, sprintId } = input;
            const updates = {};
            if (summary)
                updates.summary = summary;
            if (description)
                updates.description = description;
            if (priority)
                updates.priority = priority;
            if (labels)
                updates.labels = labels;
            if (reporter) {
                updates.reporterId = (await resolveJiraUser(reporter)).accountId;
            }
            if (assignee) {
                updates.assigneeId = (await resolveJiraUser(assignee)).accountId;
            }
            if (Object.keys(updates).length > 0) {
                await (0, jiraService_1.updateIssueFields)(issueKey, updates);
            }
            if (sprintId) {
                await (0, jiraService_1.assignIssueToSprint)(issueKey, sprintId);
            }
            return `Updated ${issueKey}.`;
        }
        catch (error) {
            return stringifyError(error);
        }
    }
});
function summarizeIssues(issues) {
    if (issues.length === 0) {
        return "No matching Jira issues were found.";
    }
    return issues
        .map((issue) => `- ${issue.key}: ${issue.summary} (Status: ${issue.status}, Updated: ${new Date(issue.updated).toLocaleDateString()}) — ${issue.url}`)
        .join("\n");
}
function summarizeIssuesWithAssignee(issues) {
    if (issues.length === 0) {
        return "No matching Jira issues were found.";
    }
    return issues
        .map((issue) => `- ${issue.key}: ${issue.summary} (Status: ${issue.status}, Assignee: ${issue.assignee || "Unassigned"}, Updated: ${new Date(issue.updated).toLocaleDateString()}) — ${issue.url}`)
        .join("\n");
}
exports.listJiraIssuesTool = new tools_1.DynamicStructuredTool({
    name: "list_jira_issues",
    description: "List Jira issues for a person (assignee or reporter) with optional status and current sprint filters.",
    schema: zod_1.z.object({
        person: zod_1.z.string().describe("Name or email of the person"),
        role: zod_1.z.enum(["assignee", "reporter"]).optional().default("assignee"),
        statuses: zod_1.z.array(zod_1.z.string().min(2)).optional().describe("List of Jira statuses to filter by"),
        sprintId: zod_1.z.number().optional().describe("Sprint ID to filter"),
        currentSprint: zod_1.z.boolean().optional().describe("Filter by current active sprint"),
        limit: zod_1.z.number().int().min(1).max(50).optional()
    }),
    func: async (input) => {
        try {
            const { person, role, statuses, sprintId, currentSprint, limit } = input;
            //console.log("listJiraIssuesTool:input", { input });
            const user = await resolveJiraUser(person);
            //console.log("listJiraIssuesTool:input", { user });
            const issues = await (0, jiraService_1.searchIssues)({
                userRole: role || "assignee",
                userAccountId: user.accountId,
                statuses,
                sprintId,
                currentSprint,
                limit
            });
            //console.log("listJiraIssuesTool:issues", { issues });
            return summarizeIssues(issues);
        }
        catch (error) {
            //console.log("listJiraIssuesTool:error", { error });
            return stringifyError(error);
        }
    }
});
exports.listJiraIssuesAllTool = new tools_1.DynamicStructuredTool({
    name: "list_jira_issues_all",
    description: "List Jira issues for all users with optional status and sprint filters.",
    schema: zod_1.z.object({
        statuses: zod_1.z.array(zod_1.z.string().min(2)).optional().describe("List of Jira statuses to filter by"),
        sprintId: zod_1.z.number().optional().describe("Sprint ID to filter"),
        currentSprint: zod_1.z.boolean().optional().describe("Filter by current active sprint"),
        limit: zod_1.z.number().int().min(1).max(200).optional()
    }),
    func: async (input) => {
        try {
            const { statuses, sprintId, currentSprint, limit } = input;
            const issues = await (0, jiraService_1.searchIssues)({
                statuses,
                sprintId,
                currentSprint,
                limit
            });
            return summarizeIssuesWithAssignee(issues);
        }
        catch (error) {
            return stringifyError(error);
        }
    }
});
exports.jiraIssueCountsTool = new tools_1.DynamicStructuredTool({
    name: "jira_issue_counts",
    description: "Count Jira issues for one or more people with optional status and sprint filters.",
    schema: zod_1.z.object({
        people: zod_1.z.array(zod_1.z.string().min(2)).min(1).describe("List of names or emails (use a single item for one person)"),
        statuses: zod_1.z.array(zod_1.z.string().min(2)).optional().describe("List of Jira statuses to filter by"),
        role: zod_1.z.enum(["assignee", "reporter"]).optional().default("assignee"),
        sprintId: zod_1.z.number().optional().describe("Sprint ID to filter"),
        currentSprint: zod_1.z.boolean().optional().describe("Filter by current active sprint")
    }),
    func: async (input) => {
        try {
            const { people, statuses, role, sprintId, currentSprint } = input;
            console.log("jiraIssueCountsTool:input", { input });
            const users = await Promise.all(people.map(resolveJiraUser));
            const counts = await Promise.all(users.map(async (user) => {
                const total = await (0, jiraService_1.countIssues)({
                    userRole: role || "assignee",
                    userAccountId: user.accountId,
                    statuses,
                    sprintId,
                    currentSprint
                });
                return { user, count: total };
            }));
            console.log("jiraIssueCountsTool:counts", { counts });
            const summaryLines = counts.map((entry, idx) => {
                const requested = people[idx] ?? entry.user.displayName;
                const label = entry.user.displayName || requested;
                return `${label} — ${entry.count} issues`;
            });
            return summaryLines.join("\n");
        }
        catch (error) {
            console.log("jiraIssueCountsTool:error", { error });
            return stringifyError(error);
        }
    }
});
