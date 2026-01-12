import { json, serverError } from "../_lib/utils.js";
import { listFiles } from "../_lib/b2.js";

export async function onRequestGet(context) {
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
        // OPTIONS 요청은 빠르게 처리하고, 204 상태코드로 응답
        return new Response(null, { status: 204 });
    }

    // 실제 GET 요청을 처리하는 부분
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