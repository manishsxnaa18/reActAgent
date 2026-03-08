export interface CreateIssueInput {
  projectKey?: string;
  summary: string;
  description?: string;
  issueType?: string;
  reporterId?: string;
  assigneeId?: string;
  priority?: string;
  labels?: string[];
}

export interface CreateIssueResult {
  id: string;
  key: string;
  selfUrl: string;
}

class JiraServiceError extends Error {
  constructor(message: string, public status?: number, public details?: unknown) {
    super(message);
    this.name = "JiraServiceError";
  }
}

const {
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  JIRA_PROJECT_KEY,
  JIRA_PROJECT_KEYS,
  JIRA_BOARD_ID
} = process.env;

function requireConfig() {
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    throw new JiraServiceError(
      "Jira credentials are not fully configured. Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN."
    );
  }

  return {
    baseUrl: JIRA_BASE_URL.replace(/\/$/, ""),
    email: JIRA_EMAIL,
    token: JIRA_API_TOKEN,
    defaultProjectKey: JIRA_PROJECT_KEY,
    defaultProjectKeys: (JIRA_PROJECT_KEYS || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
    boardId: JIRA_BOARD_ID ? Number(JIRA_BOARD_ID) : undefined
  };
}

type JiraRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

async function jiraRequest<T>(path: string, init: JiraRequestInit = {}): Promise<T> {
  const config = requireConfig();
  const url = `${config.baseUrl}${path}`;
  console.log("jiraRequest:url", { url, method: init.method });
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${config.email}:${config.token}`).toString("base64")}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(init.headers || {})
  };

    console.log("jiraRequest:headers", {headers });

  const response = await fetch(url, {
    method: init.method,
    body: init.body,
    headers
  } as any);

  console.log("jiraRequest:response", {response });

  const text = response.status === 204 ? "" : await response.text();

  if (!response.ok) {
    let details: unknown = text;
    if (text) {
      try {
        details = JSON.parse(text);
      } catch {
        details = text;
      }
    }

    let detailMessage = "";
    if (details && typeof details === "object") {
      const errorMessages = (details as any).errorMessages;
      if (Array.isArray(errorMessages) && errorMessages.length) {
        detailMessage = `: ${errorMessages.join(" | ")}`;
      }
    } else if (typeof details === "string" && details.trim()) {
      detailMessage = `: ${details.trim()}`;
    }

    throw new JiraServiceError(`Jira request failed (${response.status})${detailMessage}`, response.status, details);
  }

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export async function createIssue(input: CreateIssueInput): Promise<CreateIssueResult> {
  const config = requireConfig();
  const projectKey = input.projectKey || config.defaultProjectKey || config.defaultProjectKeys?.[0];

  if (!projectKey) {
    throw new JiraServiceError(
      "Project key is required to create an issue. Set JIRA_PROJECT_KEY or provide projectKey in the request."
    );
  }

  const fields: Record<string, unknown> = {
    project: { key: projectKey },
    summary: input.summary,
    issuetype: { name: input.issueType || "Task" }
  };

  if (input.description) fields.description = input.description;
  if (input.reporterId) fields.reporter = { id: input.reporterId };
  if (input.assigneeId) fields.assignee = { id: input.assigneeId };
  if (input.priority) fields.priority = { name: input.priority };
  if (input.labels?.length) fields.labels = input.labels;

  const issue = await jiraRequest<{ id: string; key: string; self: string }>("/rest/api/3/issue", {
    method: "POST",
    body: JSON.stringify({ fields })
  });

  return {
    id: issue.id,
    key: issue.key,
    selfUrl: issue.self
  };
}

export interface IssueFieldPatch {
  summary?: string;
  description?: string;
  reporterId?: string;
  assigneeId?: string;
  priority?: string;
  labels?: string[];
}

export async function updateIssueFields(issueKey: string, updates: IssueFieldPatch): Promise<void> {
  const fields: Record<string, unknown> = {};

  if (updates.summary) fields.summary = updates.summary;
  if (updates.description) fields.description = updates.description;
  if (updates.priority) fields.priority = { name: updates.priority };
  if (updates.labels) fields.labels = updates.labels;
  if (updates.reporterId) fields.reporter = { id: updates.reporterId };
  if (updates.assigneeId) fields.assignee = { id: updates.assigneeId };

  if (Object.keys(fields).length === 0) {
    return;
  }

  await jiraRequest(`/rest/api/3/issue/${issueKey}`, {
    method: "PUT",
    body: JSON.stringify({ fields })
  });
}

export async function assignIssueToSprint(issueKey: string, sprintId: number): Promise<void> {
  if (!sprintId) {
    throw new JiraServiceError("sprintId is required to assign an issue to a sprint.");
  }

  await jiraRequest(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
    method: "POST",
    body: JSON.stringify({ issues: [issueKey] })
  });
}

export interface IssueSearchParams {
  userRole?: "assignee" | "reporter";
  userAccountId?: string;
  projectKey?: string;
  projectKeys?: string[];
  statuses?: string[];
  sprintId?: number;
  currentSprint?: boolean;
  limit?: number;
}

export interface JiraIssueSummary {
  key: string;
  summary: string;
  status: string;
  assignee?: string;
  reporter?: string;
  updated: string;
  url: string;
}

async function getActiveSprintId(): Promise<number> {
  const config = requireConfig();
  if (!config.boardId) {
    throw new JiraServiceError("JIRA_BOARD_ID is required to fetch the current sprint.");
  }

  const result = await jiraRequest<{ values: Array<{ id: number; state: string }>; isLast: boolean }>(
    `/rest/agile/1.0/board/${config.boardId}/sprint?state=active&maxResults=1`
  );

  const active = result.values?.[0];
  if (!active?.id) {
    throw new JiraServiceError("No active sprint found for the configured board.");
  }

  return active.id;
}

async function buildJql(params: IssueSearchParams): Promise<string> {
  const config = requireConfig();
  const clauses: string[] = [];

  if (params.userRole) {
    if (!params.userAccountId) {
      throw new JiraServiceError("userAccountId is required when userRole is specified.");
    }
    clauses.push(`${params.userRole} = "${params.userAccountId}"`);
  }

  const projectKeys = (
    params.projectKeys && params.projectKeys.length > 0
      ? params.projectKeys
      : params.projectKey
        ? [params.projectKey]
        : config.defaultProjectKeys && config.defaultProjectKeys.length > 0
          ? config.defaultProjectKeys
          : config.defaultProjectKey
            ? [config.defaultProjectKey]
            : []
  )
    .map((key) => key.trim())
    .filter(Boolean);

  if (projectKeys.length === 1) {
    clauses.push(`project = ${projectKeys[0]}`);
  } else if (projectKeys.length > 1) {
    clauses.push(`project in (${projectKeys.join(", ")})`);
  }

  if (params.statuses?.length) {
    const quoted = params.statuses.map((status) => `"${status}"`).join(", ");
    clauses.push(`status in (${quoted})`);
  }

  let sprintId = params.sprintId;
  if (!sprintId && params.currentSprint) {
    sprintId = await getActiveSprintId();
  }

  if (sprintId) {
    clauses.push(`sprint = ${sprintId}`);
  }

  const clause = clauses.join(" AND ");
  return clause ? `${clause} ORDER BY updated DESC` : "ORDER BY updated DESC";
}

export async function searchIssues(params: IssueSearchParams): Promise<JiraIssueSummary[]> {
  const config = requireConfig();
  //console.log("searchIssues:params", { config });
  const jql = await buildJql(params);
  //console.log("searchIssues:jql", { jql });
  const result = await jiraRequest<{ issues: any[] }>("/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify({
      jql,
      maxResults: params.limit ?? 50,
      fields: ["summary", "status", "assignee", "reporter", "updated"]
    })
  });
   //console.log("searchIssues:result", { result });

  return result.issues.map((issue) => ({
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name,
    assignee: issue.fields.assignee?.displayName,
    reporter: issue.fields.reporter?.displayName,
    updated: issue.fields.updated,
    url: `${config.baseUrl}/browse/${issue.key}`
  }));
}

export async function countIssues(params: IssueSearchParams): Promise<number> {
  const jql = await buildJql(params);

  const result = await jiraRequest<{ total: number }>("/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify({
      jql,
      maxResults: 0,
      fields: []
    })
  });

  return result.total ?? 0;
}

export interface SummaryInput {
  userAccountIds: string[];
  statuses?: string[];
}

export interface UserIssueCount {
  user: { accountId: string; displayName: string };
  count: number;
}

export async function summarizeIssueCountsByUser(input: SummaryInput): Promise<UserIssueCount[]> {
  const counts: UserIssueCount[] = [];

  for (const accountId of input.userAccountIds) {
    const issues = await searchIssues({
      userRole: "assignee",
      userAccountId: accountId,
      statuses: input.statuses,
      limit: 200
    });

    const displayName = issues[0]?.assignee || "Unknown";
    counts.push({ user: { accountId, displayName }, count: issues.length });
  }

  return counts;
}

export async function findUsers(query: string): Promise<Array<{ accountId: string; displayName: string; emailAddress?: string }>> {
  return jiraRequest(`/rest/api/3/user/search?query=${encodeURIComponent(query)}`);
}

export { JiraServiceError };
