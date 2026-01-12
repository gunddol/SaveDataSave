import { serverError } from "../../_lib/utils.js";
import { downloadByName } from "../../_lib/b2.js";

export async function onRequestGet(context) {
    try {
        const name = context.params.name;
        if (!name) return new Response("Not found", { status: 404 });

        // 파일명 path 탈출 방지
        const safeName = name.replace(/\\/g, "/").replace(/\.\./g, "");

        const b2Res = await downloadByName(context.env, safeName);

        const headers = new Headers(b2Res.headers);
        headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(safeName)}"`);

        return new Response(b2Res.body, {
            status: b2Res.status,
            headers
        });
    } catch (e) {
        return serverError("Download failed", { detail: e?.message || String(e) });
    }
}
