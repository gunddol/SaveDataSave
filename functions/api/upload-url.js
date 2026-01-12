import { json, serverError } from "../_lib/utils.js";
import { getUploadUrl } from "../_lib/b2.js";

export async function onRequestPost(context) {
    try {
        const { uploadUrl, uploadAuthToken } = await getUploadUrl(context.env);
        return json({ uploadUrl, uploadAuthToken });
    } catch (e) {
        return serverError("Failed to get upload url", { detail: e?.message || String(e) });
    }
}
