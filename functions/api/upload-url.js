import { json, serverError } from "../_lib/utils.js";
import { getUploadUrl } from "../_lib/b2.js";

export async function onRequest(context) {
    // CORS 헤더 설정
    const origin = context.request.headers.get("Origin");
    const allowedOrigins = ["https://save-data-save.pages.dev"];  // 허용할 도메인 리스트

    // 요청을 보내는 Origin이 허용된 도메인에 포함되면, CORS 헤더를 설정
    if (allowedOrigins.includes(origin)) {
        context.response.headers.set("Access-Control-Allow-Origin", origin);
        context.response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
        context.response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-SaveVault-Token");
    }

    // OPTIONS 요청 처리 (Preflight 요청)
    if (context.request.method === "OPTIONS") {
        return new Response(null, { status: 204 });
    }

    try {
        const { uploadUrl, uploadAuthToken } = await getUploadUrl(context.env);
        return json({ uploadUrl, uploadAuthToken });
    } catch (e) {
        return serverError("Failed to get upload URL", { detail: e?.message || String(e) });
    }
}
