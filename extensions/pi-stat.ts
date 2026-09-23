import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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

function createPiStatWindow(theme: Theme, info: PiStatInfo, done: () => void) {
	return {
		render(width: number): string[] {
			if (width <= 1) return [""];

			const contentWidth = Math.max(1, width);
			const leftWidth = width < 58 ? 0 : Math.min(32, Math.max(26, Math.floor(contentWidth * 0.44)));
			const rightWidth = leftWidth > 0 ? Math.max(1, contentWidth - leftWidth - 1) : contentWidth;
			const title = theme.fg("accent", theme.bold("𝝿 stat"));

			const details = [
				statLine(theme, "pi version", info.version),
				statLine(theme, "session", info.sessionName),
				statLine(theme, "model", info.modelId),
				statLine(theme, "provider", info.modelProvider),
				statLine(theme, "thinking", info.thinkingLevel),
				statLine(theme, "current dir", info.cwd),
				"",
				theme.fg("dim", "Esc / Enter closes this window"),
			];

			if (leftWidth === 0) {
				return [
					centered(title, contentWidth),
					"",
					...colorArt(theme).map((line) => centered(line, contentWidth)),
					...details.map((line) => padToWidth(line, contentWidth)),
				].map((line) => purpleBackground(line, contentWidth));
			}

			const art = colorArt(theme);
			const paneHeight = Math.max(art.length, details.length);
			const rows = Array.from({ length: paneHeight }, (_value, index) => {
				const left = centered(art[index] ?? "", leftWidth);
				const right = padToWidth(details[index] ?? "", rightWidth);
				return `${left} ${right}`;
			});

			return [centered(title, contentWidth), "", ...rows].map((line) => purpleBackground(line, contentWidth));
		},
		handleInput(data: string): void {
			if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter)) done();
		},
		invalidate() {},
	};
}

async function openPiStat(ctx: ExtensionContext): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("pi-stat only renders in TUI mode", "error");
		return;
	}

	const info = getInfo(ctx);
	await ctx.ui.custom<void>((_tui, theme, _keybindings, done) => createPiStatWindow(theme, info, done), {
		overlay: true,
		overlayOptions: {
			anchor: "center",
			width: "50%",
			minWidth: 40,
			maxHeight: "75%",
			margin: 2,
		},
	});
}

export default function (pi: ExtensionAPI) {
	let opening = false;

	const openOnce = async (ctx: ExtensionContext) => {
		if (opening) return;
		opening = true;
		try {
			await openPiStat(ctx);
		} finally {
			opening = false;
		}
	};

	pi.registerShortcut(Key.alt("s"), {
		description: "Open the centered pi-stat window",
		handler: async (ctx) => openOnce(ctx),
	});

}
