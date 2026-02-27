import { json, serverError, badRequest } from "../../_lib/utils.js";
import { deleteFile } from "../../_lib/b2.js";

export async function onRequestDelete(context) {
    try {
        const fileName = decodeURIComponent(context.params.fileName || "");
        if (!fileName) return badRequest("fileName is required");

        await deleteFile(context.env, fileName);
        return json({ ok: true, deleted: fileName });
    } catch (e) {
        console.error("[delete] error:", e);
        return serverError("Failed to delete file", { detail: e?.message || String(e) });
    }
}
