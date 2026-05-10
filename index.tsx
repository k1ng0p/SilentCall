/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * SilentCall
 * ─────────
 * Toggle silent calls via:
 *   • Chat bar button (phone icon, green = ON, grey = OFF)
 *   • Right-click DM / Group DM → checkbox menu item
 *   • /silentcall slash command
 *
 * Confirmed working: blocks POST /call/ring via XHR patch.
 * ChatBarButton API usage matches D3SOX/vc-silentTypingEnhanced pattern.
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import {
    ChannelStore,
    Menu,
    React,
    Toasts,
    UserStore,
} from "@webpack/common";

const CallActions = findByPropsLazy("startCall", "stopRinging");

// ─── Settings ─────────────────────────────────────────────────────────────────

const settings = definePluginSettings({
    isEnabled: {
        type: OptionType.BOOLEAN,
        description: "Silent call mode — nobody gets rung when you join",
        default: false,
    },
    showIcon: {
        type: OptionType.BOOLEAN,
        description: "Show toggle button in the chat bar",
        default: true,
        restartNeeded: true,
    },
});

// ─── XHR patch ────────────────────────────────────────────────────────────────

let _origOpen: typeof XMLHttpRequest.prototype.open | null = null;
let _origSend: typeof XMLHttpRequest.prototype.send | null = null;

function installXhrPatch() {
    if (_origOpen) return;
    _origOpen = XMLHttpRequest.prototype.open;
    _origSend = XMLHttpRequest.prototype.send;
    const origOpen = _origOpen;
    const origSend = _origSend;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._scMethod = method;
        this._scUrl = String(url);
        return origOpen.apply(this, arguments as any);
    };

    XMLHttpRequest.prototype.send = function (body?) {
        if (
            settings.store.isEnabled &&
            this._scMethod?.toUpperCase() === "POST" &&
            this._scUrl?.includes("/call/ring")
        ) {
            console.debug("[SilentCall] Blocked POST /call/ring");
            return;
        }
        return origSend.apply(this, arguments as any);
    };
}

function uninstallXhrPatch() {
    if (!_origOpen) return;
    XMLHttpRequest.prototype.open = _origOpen;
    XMLHttpRequest.prototype.send = _origSend!;
    _origOpen = null;
    _origSend = null;
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function toggle() {
    settings.store.isEnabled = !settings.store.isEnabled;
}

// ─── Chat bar button ──────────────────────────────────────────────────────────

// Simple phone SVG icon
function PhoneIcon({ enabled }: { enabled: boolean; }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" style={{ overflow: "visible" }}>
            <path
                fill="currentColor"
                d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
            />
            {!enabled && (
                <line
                    x1="3" y1="3" x2="21" y2="21"
                    stroke="var(--status-danger)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                />
            )}
        </svg>
    );
}

const SilentCallButton: ChatBarButtonFactory = ({ isMainChat }) => {
    const { isEnabled, showIcon } = settings.use(["isEnabled", "showIcon"]);
    if (!isMainChat || !showIcon) return null;

    return (
        <ChatBarButton
            tooltip={isEnabled ? "Silent Call ON — click to disable" : "Silent Call OFF — click to enable"}
            onClick={toggle}
            buttonProps={{
                style: {
                    color: isEnabled ? "var(--green-360)" : "var(--interactive-muted)",
                    padding: "0 4px",
                },
            }}
        >
            <PhoneIcon enabled={isEnabled} />
        </ChatBarButton>
    );
};

// ─── Context menu ─────────────────────────────────────────────────────────────

const patchContextMenu: NavContextMenuPatchCallback = (children, { channel }) => {
    if (!channel || (channel.type !== 1 && channel.type !== 3)) return;

    children.push(
        <Menu.MenuSeparator key="sc-sep" />,
        <Menu.MenuCheckboxItem
            key="sc-toggle"
            id="vc-silent-call-toggle"
            label="Silent Call"
            checked={settings.store.isEnabled}
            action={toggle}
        />
    );
};

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "SilentCall",
    description: "Join DM / Group DM calls without ringing anyone. Toggle via chat bar icon or right-click menu.",
    authors: [{ name: "k1ng_op", id: 641266820187160576 }],
    settings,

    // Required for ChatBarButton to work
    dependencies: ["ChatInputButtonAPI"],

    contextMenus: {
        "user-context": patchContextMenu,
        "gdm-context": patchContextMenu,
    },

    // Correct API: chatBarButton object with render function
    chatBarButton: {
        render: SilentCallButton,
    },

    commands: [
        {
            name: "silentcall",
            description: "Toggle silent call mode (no ring when joining a call)",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],
            execute(_, ctx) {
                toggle();
                sendBotMessage(ctx.channel.id, {
                    content: `Silent Call is now **${settings.store.isEnabled ? "enabled" : "disabled"}**.`,
                });
            },
        },
    ],

    start() {
        installXhrPatch();
    },

    stop() {
        uninstallXhrPatch();
    },
});
