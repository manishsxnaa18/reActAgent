# Jira Integration API Contract

This document defines the proposed API contract for the upcoming Jira + Slack workflows. It covers configuration, service-layer interfaces, and LangGraph tool schemas so implementation can proceed consistently across the stack.

## 1. Configuration & Secrets

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_BASE_URL` | ✅ | Base URL of Jira Cloud tenant, e.g. `https://acme.atlassian.net`. |
| `JIRA_EMAIL` | ✅ | Jira account email associated with the API token. |
| `JIRA_API_TOKEN` | ✅ | Jira Cloud API token (Basic auth when combined with `JIRA_EMAIL`). |
| `JIRA_PROJECT_KEY` | ⚙️ | Default project key (e.g. `OPS`). Optional override per request. |
| `JIRA_BOARD_ID` | ⚙️ | Scrum board ID for sprint creation/updates. Required for sprint actions. |
| `SLACK_BOT_TOKEN` | ✅ for Slack reports | Already in use (scopes: `chat:write`, `conversations:read`, `conversations.write`, `users:read.email`). |

## 2. Jira Service Layer

File: `integrations/jiraService.ts`

All functions return typed objects or throw errors with actionable messages. Each helper automatically injects `Authorization: Basic base64(JIRA_EMAIL:JIRA_API_TOKEN)` and `Accept: application/json` headers.

### 2.1. `createIssue(input: CreateIssueInput): Promise<CreateIssueResult>`

**Input**
```
interface CreateIssueInput {
  projectKey?: string;          // default JIRA_PROJECT_KEY
  summary: string;              // required
  description?: string;         // markdown or Jira markup
  issueType?: string;           // default "Task"
  reporterId?: string;          // Jira accountId
  assigneeId?: string;          // Jira accountId
  priority?: string;            // e.g. "High"
  labels?: string[];
  attachmentPaths?: string[];   // local files to upload post-creation
}
```

**Flow**
1. POST `/rest/api/3/issue` with fields: `project.key`, `summary`, `issuetype.name`, `description`, `reporter.id`, `assignee.id`, `priority.name`, `labels`.
2. If `attachmentPaths` provided, upload sequentially via `POST /rest/api/3/issue/{issueId}/attachments`.

**Output**
```
interface CreateIssueResult {
  key: string;                  // e.g. OPS-123
  id: string;
  selfUrl: string;
  attachments?: Array<{ id: string; filename: string; }>;
}
```

### 2.2. `updateIssueFields(issueKey: string, updates: IssueFieldPatch): Promise<void>`

Handles reporter/assignee changes, summary/description edits, priority updates, labels.

```
interface IssueFieldPatch {
  summary?: string;
  description?: string;
  reporterId?: string;
  assigneeId?: string;
  priority?: string;
  labels?: string[];
}

Implementation uses `PUT /rest/api/3/issue/{issueKey}` for fields.

### 2.3. `transitionIssue(issueKey: string, targetStatus: string): Promise<void>`

- GET `/rest/api/3/issue/{issueKey}/transitions`
- Match by transition name or destination status name (case-insensitive)
- POST selected transition id to move the issue to the requested stage

### 2.4. `createOrUpdateSprint(input: SprintInput): Promise<SprintResult>`

```
interface SprintInput {
  sprintId?: number;            // omit to create
  name: string;
  startDate?: string;           // ISO8601
  endDate?: string;             // ISO8601
  goal?: string;
  state?: "future" | "active" | "closed"; // for updates
}
```

- Create: `POST /rest/agile/1.0/sprint` with `originBoardId` (from env) plus fields.
- Update: `PUT /rest/agile/1.0/sprint/{sprintId}`.

### 2.5. `assignIssue(issueKey: string, accountId: string): Promise<void>`
Dedicated helper around `PUT /rest/api/3/issue/{issueKey}/assignee`.

### 2.6. `setReporter(issueKey: string, accountId: string): Promise<void>`
Uses `PUT /rest/api/3/issue/{issueKey}/reporter`.

### 2.7. `searchIssues(params: IssueSearchParams): Promise<IssueSummary[]>`

```
interface IssueSearchParams {
  userRole?: "assignee" | "reporter";
  userAccountId?: string;
  projectKey?: string;
  statuses?: JiraStage[];       // e.g. ["To Do", "In Progress"]
  updatedAfter?: string;        // ISO date
  updatedBefore?: string;       // ISO date
  limit?: number;               // default 50
}

type JiraStage = "To Do" | "In Progress" | "UAT" | "Done" | "Closed";
```

Builds a JQL query dynamically:
```
assignee = accountId AND status IN ("In Progress","UAT") ORDER BY updated DESC
```
Executes `POST /rest/api/3/search` and returns simplified issue objects including key, summary, status, assignee/reporter names, and updated timestamp.

### 2.8. `summarizeIssueCountsByUser(input: SummaryInput): Promise<UserIssueCount[]>`

Used for weekly Slack reports.
```
interface SummaryInput {
  userAccountIds: string[];
  statuses?: JiraStage[];        // default ["UAT","Done","Closed"]
}

type UserIssueCount = {
  user: { accountId: string; displayName: string; };
  count: number;
};
```
Implementation loops through users, calls `searchIssues`, and aggregates counts.

### 2.9. `findUsers(query: string): Promise<JiraUser[]>`

Search endpoint: `GET /rest/api/3/user/search?query=${query}` to support resolving “Manish” to an `accountId`.

## 3. LangGraph Tools

All tools live in `tools/jiraTool.ts`. They will reuse Zod schemas similar to other tool definitions.

### 3.1. `create_jira_issue`
- **Description**: "Create a Jira issue (with optional attachments, reporter, assignee)."
- **Schema**
```
{
  projectKey?: string;
  title: string;          // -> summary
  description?: string;
  issueType?: string;
  reporter?: string;      // human name or email → resolved to accountId
  assignee?: string;
  priority?: string;
  labels?: string[];
  attachmentPaths?: string[];
}
```
- **Returns**: `Jira issue OPS-123 created (URL)`.

### 3.2. `update_jira_issue`
- Supports editing summary/description, swapping reporter/assignee, moving stages via `targetStatus`.
```
{
  issueKey: string;
  summary?: string;
  description?: string;
  reporter?: string;
  assignee?: string;
  priority?: string;
  labels?: string[];
  targetStatus?: JiraStage;
}
```

### 3.3. `manage_jira_sprint`
```
{
  action: "create" | "update" | "complete";
  sprintId?: number;              // required for update/complete
  name?: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
}
```
- Completion just sets `state = "closed"`.

### 3.4. `list_jira_issues`
Filter issues for a user (assignee or reporter) with optional status filters.
```
{
  person: string;                 // resolves to accountId
  role?: "assignee" | "reporter"; // default "assignee"
  statuses?: JiraStage[];
  limit?: number;
}
```
Returns bullet list summary (key, summary, status, updated).

### 3.5. `jira_issue_counts`
Aggregates counts per person for weekly Slack report.
```
{
  people: string[];               // names or emails
  statuses?: JiraStage[];         // default ["UAT","Done","Closed"]
  channelName?: string;           // optional Slack channel to auto-post
}
```
- If `channelName` provided, tool formats message and calls `message_slack_channel` internally (or returns string instructing follow-up).
- Output example: `Manish — 5 (UAT/Done)\nPallavi — 8 (UAT/Done)`.

## 4. Contact Resolution Strategy

- Extend `contacts/contactService` to store optional `jiraAccountId` per contact.
- Tool inputs accept free-form names/emails. Use priority order:
  1. Contact lookup (if contact exists + `jiraAccountId`).
  2. Jira user search (`findUsers`) with best match (exact email > case-insensitive display name).
  3. If multiple matches, return clarification prompt.

## 5. Attachment Handling

- Attachments must be read as binary buffers and uploaded with header `X-Atlassian-Token: no-check`.
- The tool should reject files > 10 MB (Jira default limit) before upload.

## 6. Error Handling

- All service calls throw `JiraServiceError` with fields `{ message, code?, details? }`.
- Tools catch errors and return human-friendly text, e.g., "Could not find Jira user for 'Manish'. Please specify email.".

## 7. Slack Weekly Digest Format

```
Weekly Jira Summary (UAT + Done)
- Manish — 5 issues (link)
- Pallavi — 8 issues (link)
```
Where `link` optionally points to a JQL search URL such as
`https://acme.atlassian.net/issues/?jql=assignee=manish@example.com AND statusCategory in (UAT, Done)`.

---
This contract can be refined further if new workflows surface, but it should cover the requested scenarios (issue CRUD, sprint operations, user filtering, and Slack reporting).
