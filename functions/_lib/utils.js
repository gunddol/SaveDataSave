export function json(data, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), { ...init, headers });
}

export function badRequest(message, extra = {}) {
    return json({ error: message, ...extra }, { status: 400 });
}

export function unauthorized(message = "Unauthorized") {
    return json({ error: message }, { status: 401 });
}

export function serverError(message = "Server error", extra = {}) {
    return json({ error: message, ...extra }, { status: 500 });
}

// 다운로드 URL에서 파일명 path segment 인코딩 (슬래시는 유지)
export function encodePathPreserveSlash(fileName) {
    return fileName
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
}
