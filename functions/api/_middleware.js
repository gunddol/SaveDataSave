import { unauthorized } from "../_lib/utils.js";

export async function onRequest(context) {
    const token = context.env.APP_TOKEN;

    // 토큰 미설정이면 보호 없이 동작(개발용)
    if (!token) return context.next();

    const got = context.request.headers.get("X-SaveVault-Token") || "";
    if (got !== token) return unauthorized("Invalid token");

    return context.next();
}
