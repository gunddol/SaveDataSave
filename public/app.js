const $ = (id) => document.getElementById(id);

const tokenInput = $("tokenInput");
const labelInput = $("labelInput");
const pickFolderBtn = $("pickFolderBtn");
const folderInput = $("folderInput");
const startBtn = $("startBtn");
const pickedText = $("pickedText");
const statusText = $("statusText");
const progressBar = $("progressBar");
const logBox = $("logBox");
const clearLogBtn = $("clearLogBtn");
const refreshBtn = $("refreshBtn");
const backupTbody = $("backupTbody");

// 선택된 파일들(상대경로 포함)
let pickedFiles = []; // [{ path, file }]
let pickedFolderName = null;

function fmtBytes(bytes) {
    if (!Number.isFinite(bytes)) return "-";
    const units = ["B", "KB", "MB", "GB"];
    let v = bytes, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
}

function setStatus(text, tone = "normal") {
    statusText.textContent = text;
    statusText.className =
        tone === "ok"
            ? "text-emerald-300 font-semibold"
            : tone === "bad"
                ? "text-rose-300 font-semibold"
                : "text-slate-100 font-medium";
}

function setProgress(pct) {
    const x = Math.max(0, Math.min(100, pct));
    progressBar.style.width = `${x}%`;
}

function appendLog(line) {
    if (logBox.firstElementChild?.classList?.contains("text-slate-400")) {
        logBox.innerHTML = "";
    }
    const div = document.createElement("div");
    div.textContent = `[${new Date().toLocaleTimeString()}] ${line}`;
    div.className = "text-slate-200";
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
}

function clearLog() {
    logBox.innerHTML = `<div class="text-slate-400">로그가 비워졌어요.</div>`;
}

function apiHeaders() {
    const h = {};
    const token = tokenInput.value.trim();
    if (token) h["X-SaveVault-Token"] = token;
    return h;
}

function sanitizeLabel(s) {
    return (s || "")
        .trim()
        .replace(/[^\w.-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
}

function makeFileName() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const label = sanitizeLabel(labelInput.value) || "backup";
    const folder = sanitizeLabel(pickedFolderName || "folder");
    return `${stamp}_${label}_${folder}.zip`;
}

async function sha1Hex(blob) {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-1", buf);
    const arr = new Uint8Array(digest);
    return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- 폴더 선택 (1) Directory Picker (2) fallback webkitdirectory ----
async function pickFolder() {
    pickedFiles = [];
    pickedFolderName = null;

    clearLog();
    setProgress(0);
    setStatus("폴더 선택 중…");

    // 1) showDirectoryPicker 지원 브라우저(크롬/엣지 등)
    if ("showDirectoryPicker" in window) {
        try {
            const dirHandle = await window.showDirectoryPicker();
            pickedFolderName = dirHandle.name;

            appendLog(`폴더 선택됨: ${pickedFolderName}`);
            appendLog(`파일 목록 수집 중…`);

            const out = [];
            await walkDirHandle(dirHandle, "", out);

            pickedFiles = out;
            pickedText.textContent = `${pickedFolderName} (${pickedFiles.length} files)`;
            appendLog(`총 ${pickedFiles.length}개 파일`);
            setStatus("준비 완료", "ok");
            return;
        } catch (e) {
            appendLog(`폴더 선택 취소/실패: ${e?.message || String(e)}`);
            setStatus("대기");
            return;
        }
    }

    // 2) fallback: input[webkitdirectory]
    folderInput.value = "";
    folderInput.click();
}

async function walkDirHandle(dirHandle, prefix, out) {
    for await (const [name, handle] of dirHandle.entries()) {
        const p = prefix ? `${prefix}/${name}` : name;

        if (handle.kind === "file") {
            const file = await handle.getFile();
            out.push({ path: p, file });
        } else if (handle.kind === "directory") {
            await walkDirHandle(handle, p, out);
        }
    }
}

folderInput.addEventListener("change", async () => {
    const files = Array.from(folderInput.files || []);
    if (!files.length) return;

    // webkitRelativePath에서 최상위 폴더명 추정
    const first = files[0].webkitRelativePath || files[0].name;
    pickedFolderName = first.split("/")[0] || "folder";

    pickedFiles = files.map((f) => ({
        path: f.webkitRelativePath || f.name,
        file: f
    }));

    clearLog();
    appendLog(`폴더 선택됨(대체 모드): ${pickedFolderName}`);
    appendLog(`총 ${pickedFiles.length}개 파일`);
    pickedText.textContent = `${pickedFolderName} (${pickedFiles.length} files)`;
    setStatus("준비 완료", "ok");
});

// ---- zip 생성 ----
async function buildZipBlob() {
    if (!pickedFiles.length) throw new Error("선택된 파일이 없습니다.");

    appendLog("파일 읽는 중…");
    setStatus("파일 읽기…");

    const fileMap = {};
    let totalBytes = 0;
    for (const it of pickedFiles) totalBytes += it.file.size;

    let doneBytes = 0;
    for (let i = 0; i < pickedFiles.length; i++) {
        const { path, file } = pickedFiles[i];
        appendLog(`읽기 (${i + 1}/${pickedFiles.length}): ${path} (${fmtBytes(file.size)})`);

        const buf = await file.arrayBuffer();
        fileMap[path] = new Uint8Array(buf);

        doneBytes += file.size;
        const pct = totalBytes ? Math.floor((doneBytes / totalBytes) * 60) : 10;
        setProgress(pct); // 읽기 단계: 0~60%
    }

    appendLog("압축 중…");
    setStatus("압축 중…");

    const zipped = await new Promise((resolve, reject) => {
        // fflate.zip: 비동기 콜백
        fflate.zip(fileMap, { level: 9 }, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });

    setProgress(80); // 압축 완료 근처
    const blob = new Blob([zipped], { type: "application/zip" });
    appendLog(`압축 완료: ${fmtBytes(blob.size)}`);
    return blob;
}

// ---- 업로드 ----
async function getUploadUrl() {
    const r = await fetch("/api/upload-url", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...apiHeaders()
        },
        body: JSON.stringify({})
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "upload-url 요청 실패");
    return data;
}

async function uploadToB2({ uploadUrl, uploadAuthToken }, zipBlob, fileName, sha1) {
    appendLog("B2 업로드 시작…");
    setStatus("업로드 중…");

    // B2는 X-Bz-File-Name을 URL 인코딩 형태로 요구
    const bzName = encodeURIComponent(fileName);

    const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
            Authorization: uploadAuthToken,
            "X-Bz-File-Name": bzName,
            "Content-Type": "application/zip",
            "X-Bz-Content-Sha1": sha1
        },
        body: zipBlob
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`B2 업로드 실패: ${res.status} ${text}`);
    }

    const data = await res.json().catch(() => ({}));
    appendLog(`업로드 완료: ${data.fileName || fileName}`);
}

// ---- 목록 ----
async function fetchBackups() {
    backupTbody.innerHTML = `
    <tr><td class="px-4 py-4 text-slate-400" colspan="4">목록을 불러오는 중…</td></tr>
  `;

    const r = await fetch("/api/backups?max=120", { headers: apiHeaders() });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
        backupTbody.innerHTML = `
      <tr><td class="px-4 py-4 text-rose-300" colspan="4">
        목록 로드 실패: ${data?.error || "unknown"}
      </td></tr>
    `;
        return;
    }

    const items = data.items || [];
    if (!items.length) {
        backupTbody.innerHTML = `
      <tr><td class="px-4 py-4 text-slate-400" colspan="4">아직 저장된 백업이 없어요.</td></tr>
    `;
        return;
    }

    backupTbody.innerHTML = "";
    for (const item of items) {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-white/5 transition";
        tr.innerHTML = `
      <td class="px-4 py-3 text-slate-100">
        <div class="truncate max-w-[22rem]" title="${item.name}">${item.name}</div>
      </td>
      <td class="px-4 py-3 text-slate-300">${fmtDate(item.uploadedAt)}</td>
      <td class="px-4 py-3 text-right text-slate-300">${fmtBytes(item.sizeBytes)}</td>
      <td class="px-4 py-3 text-right">
        <a class="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-100 transition"
           href="/api/download/${encodeURIComponent(item.name)}"
           onclick="return true;">
          받기
        </a>
      </td>
    `;
        backupTbody.appendChild(tr);
    }
}

// ---- 메인 액션 ----
async function startBackup() {
    try {
        if (!pickedFiles.length) {
            setStatus("폴더를 먼저 선택하세요", "bad");
            return;
        }

        startBtn.disabled = true;
        pickFolderBtn.disabled = true;
        setProgress(0);
        clearLog();

        appendLog("백업 준비…");
        const zipBlob = await buildZipBlob();

        setProgress(82);
        appendLog("SHA1 계산 중…");
        const sha1 = await sha1Hex(zipBlob);
        appendLog(`SHA1: ${sha1.slice(0, 10)}…`);
        setProgress(86);

        const fileName = makeFileName();
        appendLog(`업로드 파일명: ${fileName}`);

        const up = await getUploadUrl();
        setProgress(90);

        await uploadToB2(up, zipBlob, fileName, sha1);
        setProgress(100);

        setStatus("완료", "ok");
        await fetchBackups();
    } catch (e) {
        appendLog(`에러: ${e?.message || String(e)}`);
        setStatus("실패", "bad");
    } finally {
        startBtn.disabled = false;
        pickFolderBtn.disabled = false;
    }
}

// ---- 이벤트 ----
pickFolderBtn.addEventListener("click", pickFolder);
startBtn.addEventListener("click", startBackup);
clearLogBtn.addEventListener("click", clearLog);
refreshBtn.addEventListener("click", fetchBackups);

// 첫 로드
fetchBackups();
