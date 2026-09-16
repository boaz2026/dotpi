import type { ExtensionAPI, ExtensionContext, WorkingIndicatorOptions } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

type IndicatorMode = "orbit" | "bounce" | "dots" | "sparkle" | "default";

const RESET = "\x1b[0m";
const COLORS = {
	cyan: "\x1b[38;2;125;211;252m",
	blue: "\x1b[38;2;147;197;253m",
	purple: "\x1b[38;2;196;181;253m",
	pink: "\x1b[38;2;244;114;182m",
	muted: "\x1b[2;38;2;148;163;184m",
};

const DEFAULT_TEXT = "Working";
const DEFAULT_PI_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_PI_INTERVAL_MS = 80;

function color(text: string, ansi: string): string {
	return `${ansi}${text}${RESET}`;
}

function indicatorOptions(mode: IndicatorMode): WorkingIndicatorOptions | undefined {
	switch (mode) {
		case "orbit":
			return {
				frames: ["◜", "◠", "◝", "◞", "◡", "◟"].map((frame, index) =>
					color(frame, [COLORS.cyan, COLORS.blue, COLORS.purple][index % 3]!),
				),
				intervalMs: 90,
			};
		case "bounce":
			return {
				frames: ["⠁", "⠂", "⠄", "⠂"].map((frame, index) =>
					color(frame, [COLORS.cyan, COLORS.blue, COLORS.purple, COLORS.blue][index]!),
				),
				intervalMs: 110,
			};
		case "dots":
			return {
				frames: ["·  ", "·· ", "···", " ··", "  ·", "   "].map((frame) => color(frame, COLORS.cyan)),
				intervalMs: 140,
			};
		case "sparkle":
			return {
				frames: ["✦", "✧", "✶", "✧"].map((frame, index) =>
					color(frame, [COLORS.pink, COLORS.purple, COLORS.cyan, COLORS.purple][index]!),
				),
				intervalMs: 120,
			};
		case "default":
			return undefined;
	}
}

function modeLabel(mode: IndicatorMode): string {
	return mode === "default" ? "pi default" : mode;
}

class SpinnerPreview {
	private frameIndex = 0;
	private interval: ReturnType<typeof setInterval> | undefined;
	private readonly frames: string[];
	private readonly intervalMs: number;

	constructor(
		options: WorkingIndicatorOptions | undefined,
		private readonly text: string,
		private readonly requestRender: () => void,
		private readonly done: () => void,
	) {
		this.frames = options?.frames ?? DEFAULT_PI_FRAMES;
		this.intervalMs = options?.intervalMs ?? DEFAULT_PI_INTERVAL_MS;
		this.interval = setInterval(() => {
			this.frameIndex = (this.frameIndex + 1) % this.frames.length;
			this.requestRender();
		}, this.intervalMs);
	}

	render(width: number): string[] {
		const frame = this.frames[this.frameIndex] ?? "";
		return [
			truncateToWidth("", width),
			truncateToWidth(`${color("Spinner dry-run", COLORS.purple)}`, width),
			truncateToWidth(`${frame} ${color(this.text, COLORS.muted)}`, width),
			truncateToWidth(color("Press any key to stop preview", COLORS.muted), width),
		];
	}

	handleInput(_data: string): void {
		this.dispose();
		this.done();
	}

	invalidate(): void {}

	dispose(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = undefined;
		}
	}
}

export default function (pi: ExtensionAPI) {
	let mode: IndicatorMode = "orbit";
	let text = DEFAULT_TEXT;

	const apply = (ctx: ExtensionContext) => {
		if (mode === "default") {
			ctx.ui.setWorkingMessage();
			ctx.ui.setWorkingIndicator();
			ctx.ui.setStatus("streaming-working-indicator", undefined);
			return;
		}

		ctx.ui.setWorkingMessage(color(text, COLORS.muted));
		ctx.ui.setWorkingIndicator(indicatorOptions(mode));
		ctx.ui.setStatus("streaming-working-indicator", ctx.ui.theme.fg("dim", `Working: ${modeLabel(mode)} • ${text}`));
	};

	pi.on("session_start", async (_event, ctx) => {
		apply(ctx);
	});

	pi.registerCommand("working", {
		description: "Customize the streaming working indicator: /working [orbit|bounce|dots|sparkle|default] [text...]",
		handler: async (args, ctx) => {
			const [rawMode, ...textParts] = args.trim().split(/\s+/).filter(Boolean);

			if (!rawMode) {
				ctx.ui.notify(`Working indicator: ${modeLabel(mode)} • ${text}`, "info");
				return;
			}

			if (!["orbit", "bounce", "dots", "sparkle", "default"].includes(rawMode)) {
				ctx.ui.notify("Usage: /working [orbit|bounce|dots|sparkle|default] [text...]", "error");
				return;
			}

			mode = rawMode as IndicatorMode;
			if (textParts.length > 0) text = textParts.join(" ");

			apply(ctx);
			ctx.ui.notify(`Working indicator set to ${modeLabel(mode)} • ${text}`, "info");
		},
	});

	pi.registerCommand("working-preview", {
		description: "Dry-run the current or requested working spinner until any key is pressed: /working-preview [orbit|bounce|dots|sparkle|default] [text...]",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/working-preview is only available in TUI mode", "error");
				return;
			}

			let previewMode = mode;
			let previewText = text;
			const [rawMode, ...textParts] = args.trim().split(/\s+/).filter(Boolean);

			if (rawMode) {
				if (!["orbit", "bounce", "dots", "sparkle", "default"].includes(rawMode)) {
					ctx.ui.notify("Usage: /working-preview [orbit|bounce|dots|sparkle|default] [text...]", "error");
					return;
				}
				previewMode = rawMode as IndicatorMode;
				if (textParts.length > 0) previewText = textParts.join(" ");
			}

			await ctx.ui.custom<void>((tui, _theme, _keybindings, done) =>
				new SpinnerPreview(indicatorOptions(previewMode), previewText, () => tui.requestRender(), done),
			);
		},
	});
}
