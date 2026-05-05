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
import definePlugin, { OptionType } from "@utils/types";
import { cache, findStore, moduleListeners } from "@webpack";
import { Checkbox } from "@webpack/common";

const cl = classNameFactory("vc-discovery-filter-");

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

function filterGuild(guild: any) {
    if (!guild) return true;
    const { showOnlyPartnered, showOnlyVerified } = settings.store;
    if (!showOnlyPartnered && !showOnlyVerified) return true;

    const has = (f: string) =>
        Array.isArray(guild.features)
            ? guild.features.includes(f)
            : (guild.features?.has?.(f) ?? false);

    if (showOnlyPartnered && showOnlyVerified)
        return has("PARTNERED") && has("VERIFIED");
    if (showOnlyPartnered) return has("PARTNERED");
    if (showOnlyVerified) return has("VERIFIED");
    return true;
}

function updateFilter(key: string, value: boolean) {
    settings.store[key] = value;
    const store = findStore("GlobalDiscoveryServersSearchResultsStore");
    (store as any)?.emitChange?.();
}

function FilterCheckboxes() {
    const { showOnlyPartnered, showOnlyVerified } = settings.use([
        "showOnlyPartnered",
        "showOnlyVerified",
    ]);

    return (
        <div className={cl("container")}>
            <Checkbox
                value={showOnlyPartnered}
                onChange={(_, v) => updateFilter("showOnlyPartnered", v)}
            >
                Partnered Only
            </Checkbox>
            <Checkbox
                value={showOnlyVerified}
                onChange={(_, v) => updateFilter("showOnlyVerified", v)}
            >
                Verified Only
            </Checkbox>
        </div>
    );
}

const WrappedFilterCheckboxes = ErrorBoundary.wrap(FilterCheckboxes, {
    noop: true,
});

let masonryCleanup: (() => void) | null = null;
let masonryListener: ((exports: any) => void) | null = null;

function tryPatchMasonry(exports: any): (() => void) | null {
    const MasonryListComputer = exports?.default || exports?.MasonryListComputer;
    if (!MasonryListComputer?.prototype?.getItemKey) return null;

    const proto = MasonryListComputer.prototype;
    const original = proto.getItemKey;

    proto.getItemKey = function (section: any, index: number) {
        const key = original.call(this, section, index);
        if (key == null) return key;

        const item = section?.items?.[index];
        if (!item || typeof item.id !== "string") return key;
        const hasFeatures = Array.isArray(item.features) || (item.features && typeof item.features.has === "function");
        if (!hasFeatures) return key;

        return filterGuild(item) ? key : null;
    };

    return () => { proto.getItemKey = original; };
}

function patchMasonryListComputer() {
    for (const key in cache) {
        const mod = cache[key];
        if (!mod?.loaded || mod.exports == null) continue;
        const up = tryPatchMasonry(mod.exports);
        if (up) { masonryCleanup = up; return; }
        for (const nestedKey in mod.exports) {
            const up2 = tryPatchMasonry(mod.exports[nestedKey]);
            if (up2) { masonryCleanup = up2; return; }
        }
    }

    masonryListener = (exports: any) => {
        const up = tryPatchMasonry(exports);
        if (up) {
            masonryCleanup = up;
            moduleListeners.delete(masonryListener!);
            masonryListener = null;
        }
    };
    moduleListeners.add(masonryListener);
}

function unpatchMasonryListComputer() {
    if (masonryListener) {
        moduleListeners.delete(masonryListener);
        masonryListener = null;
    }
    masonryCleanup?.();
    masonryCleanup = null;
}

export default definePlugin({
    name: "DiscoveryFilter",
    description: "Filter discovery servers by partnered or verified status.",
    tags: ["Customisation", "Servers"],
    authors: [EquicordDevs.Gir0fa],
    settings,

    filterGuild,

    FilterCheckboxes: WrappedFilterCheckboxes,

    start() {
        patchMasonryListComputer();
    },

    stop() {
        unpatchMasonryListComputer();
    },

    patches: [
        {
            find: "GlobalDiscoveryServersSearchResultsStore",
            replacement: {
                match: /(?<=getGuildIds\(\i\)\{return )\i\(\i,\i=>\i\.guildIds\)/,
                replace: "$&?.filter(id=>$self.filterGuild(this.getGuild(id)))",
            },
        },
        {
            find: "GLOBAL_DISCOVERY_SIDEBAR},",
            replacement: {
                match: /GLOBAL_DISCOVERY_TABS\.map\(\i=>\(0,\i\.jsx\)\(\i,\{tab:\i\},\i\)\)\}\)(?=\])/,
                replace: "$&,$self.FilterCheckboxes()",
            },
        },
    ],
});
