import { json, serverError } from "../_lib/utils.js";
import { listFiles } from "../_lib/b2.js";

export async function onRequestGet(context) {
    try {
        const url = new URL(context.request.url);
        const max = Math.min(200, Math.max(1, Number(url.searchParams.get("max") || 100)));

        const items = await listFiles(context.env, { maxFileCount: max });
        return json({ items });
    } catch (e) {
        return serverError("Failed to list backups", { detail: e?.message || String(e) });
    }
}
