import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const PI_STAT_ART = [
	"⣴⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣦⠀",
	"⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠀",
	"⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀",
	"⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀",
	"⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀",
	"⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀",
	"⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀",
	"⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀⠀⠸⣿⣿⣿⣿⣷⣦⣤⣄",
	"⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠻⣿⣿⣿⣿⣿⣿⣿",
	"⠀⠀⠈⠙⠛⠛⠋⠀⠀⠀⠀⠀⠀⠀⠈⠙⠛⠛⠛⠛⠁",
] as const;

type PiStatInfo = {
	version: string;
	sessionName: string;
	modelId: string;
	modelProvider: string;
	thinkingLevel: string;
	cwd: string;
};

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

type UsageState =
	| { kind: "idle" }
	| { kind: "missing-credentials" }
	| { kind: "ok"; usage: UsageResponse; updatedAt: Date }
	| { kind: "error"; message: string; updatedAt: Date };

function getInfo(ctx: Pick<ExtensionContext, "sessionManager" | "model" | "thinkingLevel" | "cwd">): PiStatInfo {
	return {
		version: VERSION,
		sessionName: ctx.sessionManager.getSessionName() ?? "(unnamed session)",
		modelId: ctx.model?.id ?? "(no model selected)",
		modelProvider: ctx.model?.provider ?? "(unknown provider)",
		thinkingLevel: ctx.thinkingLevel ?? "(unknown)",
		cwd: ctx.cwd,
	};
}

function padToWidth(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width), "…");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function centered(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width), "…");
	const remaining = Math.max(0, width - visibleWidth(clipped));
	const left = Math.floor(remaining / 2);
	return `${" ".repeat(left)}${clipped}${" ".repeat(remaining - left)}`;
}

function purpleBackground(text: string, width: number): string {
	return `\x1b[48;2;36;10;52m${padToWidth(text, width)}\x1b[49m`;
}

function lolcatColor(index: number): [number, number, number] {
	const frequency = 0.24;
	return [
		Math.round(Math.sin(frequency * index + 0) * 127 + 128),
		Math.round(Math.sin(frequency * index + (2 * Math.PI) / 3) * 127 + 128),
		Math.round(Math.sin(frequency * index + (4 * Math.PI) / 3) * 127 + 128),
	];
}

function lolcat(text: string, offset = 0): string {
	return [...text]
		.map((char, index) => {
			if (char === " ") return char;
			const [red, green, blue] = lolcatColor(index + offset);
			return `\x1b[1;38;2;${red};${green};${blue}m${char}\x1b[39;22m`;
		})
		.join("");
}

const DETAIL_LABEL_WIDTH = 11;

function statLine(_theme: Theme, label: string, value: string): string {
	return `${lolcat(label.toUpperCase().padEnd(DETAIL_LABEL_WIDTH), label.length * 3)} ${value}`;
}

function colorArt(_theme: Theme): string[] {
	return PI_STAT_ART.map((line, row) =>
		[...line]
			.map((char, col) => {
				if (char === "⠀") return char;
				const [red, green, blue] = lolcatColor(row * 4 + col);
				return `\x1b[1;38;2;${red};${green};${blue}m${char}\x1b[39;22m`;
			})
			.join(""),
	);
}

function classifyWindows(rateLimit?: RateLimit) {
	const windows = [rateLimit?.primary_window, rateLimit?.secondary_window].filter((x): x is UsageWindow => Boolean(x));

	let fiveHour: UsageWindow | undefined;
	let weekly: UsageWindow | undefined;

	for (const window of windows) {
		const duration = window.limit_window_seconds;
		if (!duration) continue;

		if (Math.abs(duration - 5 * 60 * 60) < 60) {
			fiveHour = window;
			continue;
		}

		if (Math.abs(duration - 7 * 24 * 60 * 60) < 60) {
			weekly = window;
			continue;
		}

		if (duration >= 2 * 24 * 60 * 60) weekly ??= window;
		else fiveHour ??= window;
	}

	return { fiveHour, weekly };
}

function remainingPercent(window?: UsageWindow): number | undefined {
	if (!window || typeof window.used_percent !== "number" || !Number.isFinite(window.used_percent)) return undefined;
	return Math.max(0, Math.min(100, 100 - window.used_percent));
}

function progressBar(label: string, remaining: number | undefined, width: number): string {
	const percentText = remaining === undefined ? "??%" : `${remaining.toFixed(0).padStart(2, " ")}%`;
	const prefix = `${label.padEnd(6)} `;
	const suffix = ` ${percentText}`;
	const barWidth = Math.max(1, width - visibleWidth(prefix) - visibleWidth(suffix) - 2);
	const filled = remaining === undefined ? 0 : Math.round((barWidth * remaining) / 100);
	const empty = Math.max(0, barWidth - filled);
	const cells = lolcat("█".repeat(filled), label.length * 8) + `\x1b[38;2;85;65;100m${"░".repeat(empty)}\x1b[39m`;
	return `${prefix}[${cells}]${suffix}`;
}

function formatUsageDetails(theme: Theme, state: UsageState, width: number): string[] {
	if (state.kind === "idle") return [statLine(theme, "chatgpt", "loading usage…")];
	if (state.kind === "missing-credentials") return [statLine(theme, "chatgpt", "missing CHATGPT_ACCESS_TOKEN / CHATGPT_ACCOUNT_ID")];
	if (state.kind === "error") return [statLine(theme, "chatgpt", `usage error: ${state.message.split("\n")[0]}`)];

	const { fiveHour, weekly } = classifyWindows(state.usage.rate_limit);
	const barWidth = width;
	const lines = [
		statLine(theme, "chatgpt", "quota remaining"),
		progressBar("5h", remainingPercent(fiveHour), barWidth),
		progressBar("week", remainingPercent(weekly), barWidth),
	];

	if (state.usage.plan_type) lines.push(statLine(theme, "plan", state.usage.plan_type));
	if (state.usage.rate_limit?.limit_reached) lines.push(statLine(theme, "limit", "reached"));
	if (state.usage.credits?.balance !== undefined) lines.push(statLine(theme, "credits", String(state.usage.credits.balance)));

	return lines;
}

type ChatGPTCredentials = {
	accessToken?: string;
	accountId?: string;
};

function readStringSetting(settings: unknown, key: string): string | undefined {
	if (!settings || typeof settings !== "object") return undefined;
	const value = (settings as Record<string, unknown>)[key];
	return typeof value === "string" && value.trim() ? value : undefined;
}

async function readSettingsCredentials(settingsPath: string): Promise<ChatGPTCredentials> {
	try {
		const settings = JSON.parse(await readFile(settingsPath, "utf8")) as unknown;
		return {
			accessToken: readStringSetting(settings, "CHATGPT_ACCESS_TOKEN"),
			accountId: readStringSetting(settings, "CHATGPT_ACCOUNT_ID"),
		};
	} catch {
		return {};
	}
}

function getAgentSettingsPath(): string {
	const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
	return join(agentDir, "settings.json");
}

async function getChatGPTCredentials(ctx: ExtensionContext): Promise<Required<ChatGPTCredentials> | undefined> {
	let accessToken = process.env.CHATGPT_ACCESS_TOKEN;
	let accountId = process.env.CHATGPT_ACCOUNT_ID;

	const settingsPaths = [getAgentSettingsPath()];
	if (ctx.isProjectTrusted()) settingsPaths.push(join(ctx.cwd, ".pi", "settings.json"));

	for (const settingsPath of settingsPaths) {
		if (accessToken && accountId) break;
		const credentials = await readSettingsCredentials(settingsPath);
		accessToken ||= credentials.accessToken;
		accountId ||= credentials.accountId;
	}

	if (!accessToken || !accountId) return undefined;
	return { accessToken, accountId };
}

async function fetchUsage(accessToken: string, accountId: string): Promise<UsageResponse> {
	const response = await fetch(USAGE_URL, {
		method: "GET",
		signal: AbortSignal.timeout(15_000),
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
		throw new Error(`ChatGPT usage API returned ${response.status} ${response.statusText}\n${body}`);
	}

	return (await response.json()) as UsageResponse;
}

async function updateUsageStatus(ctx: ExtensionContext, setUsageState: (state: UsageState) => void, options: { notifyErrors?: boolean } = {}): Promise<void> {
	const credentials = await getChatGPTCredentials(ctx);

	if (!credentials) {
		setUsageState({ kind: "missing-credentials" });

		if (options.notifyErrors) {
			ctx.ui.notify([
				"Missing ChatGPT credentials.",
				"",
				"Set CHATGPT_ACCESS_TOKEN and CHATGPT_ACCOUNT_ID in the environment",
				"or in settings.json.",
			].join("\n"), "error");
		}

		return;
	}

	try {
		const usage = await fetchUsage(credentials.accessToken, credentials.accountId);
		setUsageState({ kind: "ok", usage, updatedAt: new Date() });

	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setUsageState({ kind: "error", message, updatedAt: new Date() });


		if (options.notifyErrors) ctx.ui.notify(`Failed to fetch ChatGPT usage:\n${message}`, "error");
	}
}

function createPiStatWindow(theme: Theme, info: PiStatInfo, getUsageState: () => UsageState, done: () => void, requestRender: () => void) {
	let activeTab: "overview" | "usage" = "overview";

	return {
		render(width: number): string[] {
			if (width <= 1) return [""];

			const contentWidth = Math.max(1, width);
			const leftWidth = width < 72 ? 0 : Math.min(32, Math.max(26, Math.floor(contentWidth * 0.44)));
			const rightWidth = leftWidth > 0 ? Math.max(1, contentWidth - leftWidth - 1) : contentWidth;
			const title = theme.fg("accent", theme.bold("𝝿 stat"));

			const tabs = (["overview", "usage"] as const).map((tab) => {
				const label = tab === "overview" ? "Overview" : "Usage";
				return tab === activeTab
					? theme.fg("accent", theme.bold(`[ ${label} ]`))
					: theme.fg("dim", `  ${label}  `);
			}).join("  ");
			const header = [centered(title, contentWidth), centered(tabs, contentWidth), ""];
			const footer = ["", centered(theme.fg("dim", "Tab / ← → switch · Esc / Enter close"), contentWidth)];

			const details = activeTab === "usage" ? formatUsageDetails(theme, getUsageState(), rightWidth) : [
				statLine(theme, "pi version", info.version),
				statLine(theme, "session", info.sessionName),
				statLine(theme, "model", info.modelId),
				statLine(theme, "provider", info.modelProvider),
				statLine(theme, "thinking", info.thinkingLevel),
				statLine(theme, "current dir", info.cwd),
			];

			if (leftWidth === 0) {
				return [
					...header,
					...details.map((line) => padToWidth(line, contentWidth)),
					...footer,
				].map((line) => purpleBackground(line, contentWidth));
			}

			const art = colorArt(theme);
			const paneHeight = Math.max(art.length, details.length);
			const rows = Array.from({ length: paneHeight }, (_value, index) => {
				const left = centered(art[index] ?? "", leftWidth);
				const right = padToWidth(details[index] ?? "", rightWidth);
				return `${left} ${right}`;
			});

			return [...header, ...rows, ...footer].map((line) => purpleBackground(line, contentWidth));
		},
		handleInput(data: string): void {
			if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter)) {
				done();
			} else if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
				activeTab = activeTab === "overview" ? "usage" : "overview";
				requestRender();
			}
		},
		invalidate() {},
	};
}

async function openPiStat(ctx: ExtensionContext, getUsageState: () => UsageState, setRender: (render?: () => void) => void): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("pi-stat only renders in TUI mode", "error");
		return;
	}

	const info = getInfo(ctx);
	await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
		setRender(() => tui.requestRender());
		return createPiStatWindow(theme, info, getUsageState, done, () => tui.requestRender());
	}, {
		overlay: true,
		overlayOptions: {
			anchor: "center",
			width: "60%",
			minWidth: 48,
			maxHeight: "80%",
			margin: 2,
		},
	});
}

export default function (pi: ExtensionAPI) {
	let opening = false;
	let requestRender: (() => void) | undefined;
	let refreshTimer: ReturnType<typeof setInterval> | undefined;
	let usageState: UsageState = { kind: "idle" };

	const setUsageState = (state: UsageState) => {
		usageState = state;
		requestRender?.();
	};

	const openOnce = async (ctx: ExtensionContext) => {
		if (opening) return;
		opening = true;
		try {
			await openPiStat(ctx, () => usageState, (render) => { requestRender = render; });
		} finally {
			opening = false;
			requestRender = undefined;
		}
	};

	pi.on("session_start", async (_event, ctx) => {
		if (refreshTimer) clearInterval(refreshTimer);
		void updateUsageStatus(ctx, setUsageState);

		refreshTimer = setInterval(() => {
			void updateUsageStatus(ctx, setUsageState);
		}, REFRESH_INTERVAL_MS);
	});

	pi.on("session_shutdown", () => {
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = undefined;
		}
	});

	pi.registerShortcut(Key.alt("s"), {
		description: "Open the centered pi-stat window",
		handler: async (ctx) => openOnce(ctx),
	});

	pi.registerCommand("usage", {
		description: "Refresh ChatGPT 5-hour and weekly usage limits",
		handler: async (_args, ctx) => {
			await updateUsageStatus(ctx, setUsageState, { notifyErrors: true });
		},
	});
}
