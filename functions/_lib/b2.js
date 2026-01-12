import { serverError } from "./utils.js";

const AUTH_URL = "https://api.backblazeb2.com/b2api/v2/b2_authorize_account";

// 간단 캐시 (워커 인스턴스 생존 동안 유지)
let cachedAuth = null;
// { apiUrl, downloadUrl, authorizationToken, recommendedTTLms, cachedAt }

function getBasicAuthHeader(keyId, appKey) {
    const token = btoa(`${keyId}:${appKey}`);
    return `Basic ${token}`;
}

async function authorize(env) {
    const keyId = env.B2_KEY_ID;
    const appKey = env.B2_APPLICATION_KEY;

    if (!keyId || !appKey) {
        throw new Error("Missing B2_KEY_ID or B2_APPLICATION_KEY");
    }

    const res = await fetch(AUTH_URL, {
        headers: {
            Authorization: getBasicAuthHeader(keyId, appKey)
        }
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`B2 authorize failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    cachedAuth = {
        apiUrl: data.apiUrl,
        downloadUrl: data.downloadUrl,
        authorizationToken: data.authorizationToken,
        cachedAt: Date.now()
    };
    return cachedAuth;
}

// 보수적으로 20시간마다 재인증(토큰 만료/정책 변경 대비)
async function getAuth(env) {
    if (!cachedAuth) return authorize(env);
    const age = Date.now() - cachedAuth.cachedAt;
    if (age > 20 * 60 * 60 * 1000) return authorize(env);
    return cachedAuth;
}

export async function getUploadUrl(env) {
    const { apiUrl, authorizationToken } = await getAuth(env);

    const bucketId = env.B2_BUCKET_ID;
    if (!bucketId) throw new Error("Missing B2_BUCKET_ID");

    const res = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
        method: "POST",
        headers: {
            Authorization: authorizationToken,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ bucketId })
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`b2_get_upload_url failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return {
        uploadUrl: data.uploadUrl,
        uploadAuthToken: data.authorizationToken
    };
}

export async function listFiles(env, { maxFileCount = 100 } = {}) {
    const { apiUrl, authorizationToken } = await getAuth(env);
    const bucketId = env.B2_BUCKET_ID;
    if (!bucketId) throw new Error("Missing B2_BUCKET_ID");

    let startFileName = null;
    const items = [];

    while (items.length < maxFileCount) {
        const remaining = maxFileCount - items.length;

        const res = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
            method: "POST",
            headers: {
                Authorization: authorizationToken,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                bucketId,
                maxFileCount: Math.min(remaining, 1000),
                ...(startFileName ? { startFileName } : {})
            })
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`b2_list_file_names failed: ${res.status} ${text}`);
        }

        const data = await res.json();
        const files = data.files || [];

        for (const f of files) {
            items.push({
                name: f.fileName,
                sizeBytes: f.contentLength,
                uploadedAt: new Date(f.uploadTimestamp).toISOString()
            });
            if (items.length >= maxFileCount) break;
        }

        if (!data.nextFileName) break;
        startFileName = data.nextFileName;
    }

    // 최신순 정렬(업로드 타임스탬프 기준)
    items.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
    return items;
}

export async function downloadByName(env, fileName) {
    const { downloadUrl, authorizationToken } = await getAuth(env);
    const bucketName = env.B2_BUCKET_NAME;
    if (!bucketName) throw new Error("Missing B2_BUCKET_NAME");

    // Private bucket: Authorization 헤더로 다운로드
    const url = `${downloadUrl}/file/${encodeURIComponent(bucketName)}/${fileName
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/")}`;

    const res = await fetch(url, {
        headers: {
            Authorization: authorizationToken
        }
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`B2 download failed: ${res.status} ${text}`);
    }

    return res;
}
