import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

interface UsageWindow {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_after_seconds?: number;
  reset_at?: number;
}

interface RateLimit {
  allowed?: boolean;
  limit_reached?: boolean;
  primary_window?: UsageWindow;
  secondary_window?: UsageWindow;
}

interface UsageResponse {
  plan_type?: string;
  rate_limit?: RateLimit;

  additional_rate_limits?: unknown[];

  credits?: {
    has_credits?: boolean;
    unlimited?: boolean;
    balance?: number | string;
  };
}

function getWindowUsage(window?: UsageWindow): string {
  if (!window || typeof window.used_percent !== "number") {
    return "?%";
  }

  return `${Math.max(0, 100 - window.used_percent).toFixed(0)}%`;
}

function formatStatusText(usage: UsageResponse): string {
  const { fiveHour, weekly } = classifyWindows(usage.rate_limit);
  const parts = [
    `5h ${getWindowUsage(fiveHour)}`,
    `week ${getWindowUsage(weekly)}`,
  ];

  if (usage.rate_limit?.limit_reached) {
    parts.push("limit reached");
  }

  if (usage.credits?.balance !== undefined) {
    parts.push(`credits ${usage.credits.balance}`);
  }

  return `ChatGPT ${parts.join(" · ")}`;
}

function classifyWindows(rateLimit?: RateLimit) {
  const windows = [
    rateLimit?.primary_window,
    rateLimit?.secondary_window,
  ].filter((x): x is UsageWindow => Boolean(x));

  let fiveHour: UsageWindow | undefined;
  let weekly: UsageWindow | undefined;

  for (const window of windows) {
    const duration = window.limit_window_seconds;

    if (!duration) continue;

    // 5 hours
    if (Math.abs(duration - 5 * 60 * 60) < 60) {
      fiveHour = window;
      continue;
    }

    // 7 days
    if (Math.abs(duration - 7 * 24 * 60 * 60) < 60) {
      weekly = window;
      continue;
    }

    // Be tolerant if OpenAI changes the exact duration.
    if (duration >= 2 * 24 * 60 * 60) {
      weekly ??= window;
    } else {
      fiveHour ??= window;
    }
  }

  return { fiveHour, weekly };
}

async function fetchUsage(
  accessToken: string,
  accountId: string
): Promise<UsageResponse> {
  const response = await fetch(USAGE_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "ChatGPT-Account-Id": accountId,
      Accept: "application/json",
      Origin: "https://chatgpt.com",
      Referer: "https://chatgpt.com/",
    },
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `ChatGPT usage API returned ${response.status} ${response.statusText}\n${body}`
    );
  }

  return (await response.json()) as UsageResponse;
}

async function updateUsageStatus(
  ctx: ExtensionContext,
  options: { notifyErrors?: boolean } = {}
): Promise<void> {
  const accessToken = process.env.CHATGPT_ACCESS_TOKEN;
  const accountId = process.env.CHATGPT_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    ctx.ui.setStatus("chatgpt-usage", "ChatGPT usage: missing credentials");

    if (options.notifyErrors) {
      ctx.ui.notify(
        [
          "Missing ChatGPT credentials.",
          "",
          "Set:",
          "  CHATGPT_ACCESS_TOKEN",
          "  CHATGPT_ACCOUNT_ID",
        ].join("\n"),
        "error"
      );
    }

    return;
  }

  try {
    const usage = await fetchUsage(accessToken, accountId);

    ctx.ui.setStatus("chatgpt-usage", formatStatusText(usage));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    ctx.ui.setStatus(
      "chatgpt-usage",
      `ChatGPT usage error: ${message.split("\n")[0]}`
    );

    if (options.notifyErrors) {
      ctx.ui.notify(
        `Failed to fetch ChatGPT usage:\n${message}`,
        "error"
      );
    }
  }
}

export default function (pi: ExtensionAPI) {
  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  pi.on("session_start", async (_event, ctx) => {
    await updateUsageStatus(ctx);

    refreshTimer = setInterval(() => {
      void updateUsageStatus(ctx);
    }, REFRESH_INTERVAL_MS);
  });

  pi.on("session_shutdown", () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
  });

  pi.registerCommand("usage", {
    description: "Refresh ChatGPT 5-hour and weekly usage limits",

    handler: async (_args, ctx) => {
      await updateUsageStatus(ctx, { notifyErrors: true });
    },
  });
}
