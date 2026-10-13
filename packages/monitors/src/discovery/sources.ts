/** Every discovery source by id (server side: they use the network). */
import type { Source } from "./types.js";
import { subnetSource } from "./subnet.js";
import { vcenterSource } from "./vcenter.js";
import { lldpSource } from "./lldp.js";
import { oneviewSource } from "./oneview.js";
export const SOURCES: Record<string, Source> = { subnet: subnetSource, vcenter: vcenterSource, lldp: lldpSource, oneview: oneviewSource };
export type { Found, Source, SourceContext } from "./types.js";
export { mergeFound } from "./merge.js";
