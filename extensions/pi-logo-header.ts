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

function renderPiLogo(theme: Theme): string[] {
	const colors: Record<string, (text: string) => string> = {
		"█": (text) => theme.fg("accent", theme.bold(text)),
		"░": (text) => theme.fg("dim", text),
	};

	return PI_ART.map((line) =>
		[...line]
			.map((char) => colors[char]?.(char) ?? char)
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

function createPiLogoHeader(theme: Theme, info: HeaderInfo) {
	return {
		render(_width: number): string[] {
			const logo = renderPiLogo(theme);
			const title = `${theme.fg("muted", "pi")} ${theme.fg("dim", ` v${VERSION}`)}`;
			const session = `${theme.fg("muted", "session:")} ${info.sessionName}`;
			const sessionFile = `${theme.fg("muted", "file:")} ${theme.fg("dim", info.sessionFile)}`;
			const model = `${theme.fg("muted", "model:")} ${info.modelId} ${theme.fg("muted", "provider:")} ${info.modelProvider}`;

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
