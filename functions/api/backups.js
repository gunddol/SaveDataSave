import { json, serverError } from "../_lib/utils.js";
import { listFiles } from "../_lib/b2.js";

export async function onRequestGet(context) {
    try {
        console.log("Request to /api/backups received");  // 로그 추가

        const url = new URL(context.request.url);
        const max = Math.min(200, Math.max(1, Number(url.searchParams.get("max") || 100)));

        console.log(`Listing files with maxFileCount: ${max}`);  // 로그 추가

        const items = await listFiles(context.env, { maxFileCount: max });

        console.log(`Files found: ${items.length}`);  // 로그 추가

        return json({ items });
    } catch (e) {
        console.error("Error occurred while listing backups:", e);  // 에러 로그
        return serverError("Failed to list backups", { detail: e?.message || String(e) });
    }
}
