import type { ExtensionAPI, ExtensionContext, ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";

const PI_ART = [
	"████████████████████",
	"████████████████████░░",
	"  ░███░░░░░░░░███░░░░░",
	"   ███░░      ███░░",
	"   ███░░      ███░░",
	"   ███░░      ███░░",
	"   ███░░      ███░░",
	"   ███░░      ███░░",
	"     ░░░        ░░░",
	"",
] as const;

function lolcatColor(index: number): [number, number, number] {
	const frequency = 0.28;
	const red = Math.round(Math.sin(frequency * index + 0) * 127 + 128);
	const green = Math.round(Math.sin(frequency * index + (2 * Math.PI) / 3) * 127 + 128);
	const blue = Math.round(Math.sin(frequency * index + (4 * Math.PI) / 3) * 127 + 128);
	return [red, green, blue];
}

function lolcat(text: string, index: number, mode: "bold" | "dim"): string {
	const [red, green, blue] = lolcatColor(index);
	const style = mode === "bold" ? "1" : "2";
	return `\x1b[${style};38;2;${red};${green};${blue}m${text}\x1b[39;22m`;
}

function renderPiLogo(_theme: Theme): string[] {
	return PI_ART.map((line, lineIndex) =>
		[...line]
			.map((char, columnIndex) => {
				if (char !== "█" && char !== "░") return char;

				const colorIndex = columnIndex + lineIndex * 2;
				return lolcat(char, colorIndex, char === "█" ? "bold" : "dim");
			})
			.join("")
			.trimEnd(),
	);
}

interface HeaderInfo {
	sessionName: string;
	sessionFile: string;
	modelId: string;
	modelProvider: string;
}

function getHeaderInfo(ctx: Pick<ExtensionContext, "sessionManager" | "model">): HeaderInfo {
	return {
		sessionName: ctx.sessionManager.getSessionName() ?? "(unnamed session)",
		sessionFile: ctx.sessionManager.getSessionFile() ?? "(ephemeral session)",
		modelId: ctx.model?.id ?? "(no model selected)",
		modelProvider: ctx.model?.provider ?? "(unknown provider)",
	};
}

function truncateMiddle(text: string, maxWidth: number): string {
	if (text.length <= maxWidth) return text;
	if (maxWidth <= 1) return "…";

	const left = Math.ceil((maxWidth - 1) / 2);
	const right = Math.floor((maxWidth - 1) / 2);
	return `${text.slice(0, left)}…${text.slice(-right)}`;
}

function createPiLogoHeader(theme: Theme, info: HeaderInfo) {
	return {
		render(width: number): string[] {
			const logo = renderPiLogo(theme);
			const title = `${theme.fg("muted", "pi")} ${theme.fg("dim", ` v${VERSION}`)}`;
			const session = `${theme.fg("muted", "session:")} ${truncateMiddle(info.sessionName, Math.max(1, width - 9))}`;
			const sessionFile = `${theme.fg("muted", "file:")} ${theme.fg("dim", truncateMiddle(info.sessionFile, Math.max(1, width - 6)))}`;
			const modelText = `model: ${info.modelId} provider: ${info.modelProvider}`;
			const model = theme.fg("muted", truncateMiddle(modelText, Math.max(1, width)));

			return ["", ...logo, title, session, sessionFile, model, ""];
		},
		invalidate() {},
	};
}

function setPiLogoHeader(ctx: Pick<ExtensionContext, "sessionManager" | "model"> & { ui: Pick<ExtensionUIContext, "setHeader"> }) {
	const info = getHeaderInfo(ctx);
	ctx.ui.setHeader((_tui, theme) => createPiLogoHeader(theme, info));
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode === "tui") setPiLogoHeader(ctx);
	});

	pi.on("session_info_changed", async (_event, ctx) => {
		if (ctx.mode === "tui") setPiLogoHeader(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		if (ctx.mode === "tui") setPiLogoHeader(ctx);
	});
}
