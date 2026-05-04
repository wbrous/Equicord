/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { EquicordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findStore } from "@webpack";
import { Checkbox } from "@webpack/common";

const cl = classNameFactory("vc-discovery-filter-");
const logger = new Logger("DiscoveryFilter");

const settings = definePluginSettings({
    showOnlyPartnered: {
        type: OptionType.BOOLEAN,
        description: "Show only partnered servers in discovery.",
        default: false,
    },
    showOnlyVerified: {
        type: OptionType.BOOLEAN,
        description: "Show only verified servers in discovery.",
        default: false,
    },
});

function hasFeature(guild: any, feature: string): boolean {
    const { features } = guild;
    if (Array.isArray(features)) return features.includes(feature);
    return features?.has?.(feature) ?? false;
}

function filterGuild(guild: any): boolean {
    const { showOnlyPartnered, showOnlyVerified } = settings.store;
    if (!showOnlyPartnered && !showOnlyVerified) return true;

    if (showOnlyPartnered && showOnlyVerified) {
        return hasFeature(guild, "PARTNERED") && hasFeature(guild, "VERIFIED");
    }
    if (showOnlyPartnered) return hasFeature(guild, "PARTNERED");
    if (showOnlyVerified) return hasFeature(guild, "VERIFIED");
    return true;
}

function FilterCheckboxes() {
    const { showOnlyPartnered, showOnlyVerified } = settings.use(["showOnlyPartnered", "showOnlyVerified"]);

    return (
        <div className={cl("container")}>
            <Checkbox
                value={showOnlyPartnered}
                onChange={(_, v) => settings.store.showOnlyPartnered = v}
            >
                Partnered Only
            </Checkbox>
            <Checkbox
                value={showOnlyVerified}
                onChange={(_, v) => settings.store.showOnlyVerified = v}
            >
                Verified Only
            </Checkbox>
        </div>
    );
}

const WrappedFilterCheckboxes = ErrorBoundary.wrap(FilterCheckboxes, { noop: true });

let originalGetGuildIds: Function;

export default definePlugin({
    name: "DiscoveryFilter",
    description: "Filter discovery servers by partnered or verified status.",
    tags: ["Discovery", "Servers"],
    authors: [EquicordDevs.Gir0fa],
    settings,

    start() {
        const store = findStore("GlobalDiscoveryServersSearchResultsStore") as any;
        if (!store?.getGuildIds) {
            logger.error("Could not find GlobalDiscoveryServersSearchResultsStore");
            return;
        }

        originalGetGuildIds = store.getGuildIds.bind(store);
        store.getGuildIds = function (e: any) {
            const ids = originalGetGuildIds(e);
            if (!ids) return ids;
            return ids.filter((id: string) => {
                const guild = store.getGuild(id);
                if (!guild) return true;
                return filterGuild(guild);
            });
        };
    },

    stop() {
        const store = findStore("GlobalDiscoveryServersSearchResultsStore") as any;
        if (originalGetGuildIds && store) {
            store.getGuildIds = originalGetGuildIds;
        }
    },

    FilterCheckboxes: WrappedFilterCheckboxes,

    patches: [
        {
            find: "chunkSize:24",
            replacement: {
                match: /(return \(0,\i\.jsx\)\("div",\{className:\i\.\i,children:)\(0,\i\.jsx\)\(\i\.\i,\{selectionMode:"single"/,
                replace: "$1[$self.FilterCheckboxes(),$2"
            }
        }
    ]
});
