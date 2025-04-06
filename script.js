import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";

// Firebase 設定（login.htmlと同じ設定を使用）
const firebaseConfig = {
    apiKey: "AIzaSyCGsox95fxZh4J4ZQz4pm2o2_YwXUbXcaU",
    authDomain: "fudaoxiang-chat.firebaseapp.com",
    projectId: "fudaoxiang-chat",
    storageBucket: "fudaoxiang-chat.firebasestorage.app",
    messagingSenderId: "1008159058306",
    appId: "1:1008159058306:web:4ba3fd0ed4595a09ac479b",
    measurementId: "G-EWMWZBX4TT"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// === Google Drive Integration ===
const WORKER_URL = 'https://receipt-camera-api.fudaoxiang-gym.workers.dev';
const DRIVE_API_KEY = null; // APIキーはOAuthクライアントIDと別。今回は不要なはず。
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// ★ 写真キュー用の配列
let capturedImagesQueue = [];

let tokenClient = null;
let gapiInited = false;
let gisInited = false;
let googleClientId = null;
let googleDriveFolderId = null; // ★ フォルダIDを格納する変数を追加

// === コールバック関数をグローバルスコープに公開 ===
window.gapiLoadedCallback = () => {
    gapi.load('client', initializeGapiClient);
    gapiInited = true;
    console.log('GAPI client loaded.');
    if (gisInited) maybeEnableAuthButton();
};

window.gisLoadedCallback = () => {
    gisInited = true;
    console.log('GIS client loaded.');
    if (googleClientId) initializeGis();
    if (gapiInited) maybeEnableAuthButton();
};
// ==========================================

// WorkerからクライアントIDとフォルダIDを取得する
async function fetchGoogleConfig() { // 関数名を変更
    try {
        const response = await fetch(WORKER_URL);
        if (!response.ok) throw new Error(`Worker request failed: ${response.status}`);
        const data = await response.json();
        if (!data.clientId || !data.folderId) { // ★ 両方チェック
             throw new Error('Client ID or Folder ID not in worker response');
        }
        googleClientId = data.clientId;
        googleDriveFolderId = data.folderId; // ★ フォルダIDを保存
        console.log('Google Config fetched successfully (Client ID & Folder ID).');
        // GIS初期化を試みる
        initializeGis();
    } catch (error) {
        console.error("Error fetching Google Config:", error);
        alert("Google設定情報の取得に失敗しました。");
    }
}

// GAPIクライアントの初期化
function initializeGapiClient() {
    if (gapiInited) return;
    if (typeof gapi === 'undefined' || typeof gapi.load === 'undefined') {
        console.log("GAPI library or gapi.load not ready yet, will retry...");
        setTimeout(initializeGapiClient, 500);
        return;
    }
    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                discoveryDocs: [DISCOVERY_DOC],
            });
            gapiInited = true;
            console.log('GAPI client initialized via gapi.load.');
        } catch (error) {
            console.error("Error initializing GAPI client via gapi.load:", error);
        }
    });
}

// GISクライアントの初期化
function initializeGis() {
    if (!googleClientId) {
        console.error("Google Client ID not available for GIS initialization.");
        return;
    }
    if (gisInited) return;
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        console.log("GIS library not ready yet, will retry...");
        setTimeout(initializeGis, 500);
        return;
    }
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: googleClientId,
            scope: SCOPES,
            callback: handleTokenResponse,
        });
        gisInited = true;
        console.log('GIS token client initialized.');
    } catch (error) {
        console.error("Error initializing GIS token client:", error);
    }
}

// トークン取得後の処理
function handleTokenResponse(response) {
    if (response.error) {
        if (response.error === 'interaction_required' || response.error === 'user_logged_out' || response.error === 'user_cancel') {
            console.warn('Google OAuth Interaction Required/User Cancelled:', response.error);
        } else {
            console.error('Google OAuth Error:', response.error);
            alert('Google認証中に予期せぬエラーが発生しました。');
        }
        if (window.gapi && gapi.client) {
             gapi.client.setToken(null);
        }
        updateAuthStatus(false);
        return;
    }
    console.log('Google Access Token acquired.');
    if (window.gapi && gapi.client) {
        gapi.client.setToken({ access_token: response.access_token });
    } else {
        console.error('GAPI client not initialized before setting token.');
    }
    updateAuthStatus(true);
}

// Google認証を開始する関数 (consent prompt)
function requestGoogleAuth() {
    if (tokenClient) {
        console.log("Requesting Google consent...");
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        console.error("Cannot request Google Auth: tokenClient not initialized.");
    }
}

// 認証状態を更新する関数
function updateAuthStatus(isAuthed) {
    console.log('Google Auth status updated:', isAuthed);
    window.isGoogleAuthed = isAuthed;
}

// ★ 枚数表示バッジを更新する関数
function updatePhotoCountBadge() {
    const badge = document.getElementById('photo-count-badge');
    const count = capturedImagesQueue.length;
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none'; // blockから変更してインライン要素っぽく
        // 必要に応じて親ボタン(#google-upload-button)のスタイル調整が必要かも
    }
}

// 認証状態の監視
onAuthStateChanged(auth, (user) => {
  if (user) {
    // ユーザーがログインしている場合
    console.log("ログイン中のユーザー:", user.uid);
    // カメラ起動などの初期化処理を実行
    initializeCameraApp(); 
  } else {
    // ユーザーがログインしていない場合
    console.log("ユーザーはログインしていません。ログインページにリダイレクトします。");
    window.location.href = "login.html";
  }
});

// カメラアプリの初期化処理を関数にまとめる
function initializeCameraApp() {
    console.log("カメラアプリを初期化します。");
    fetchGoogleConfig();
    initializeGapiClient();

    // ★ アップロードボタンのイベントリスナー (旧 #upload-queue-button のロジックを統合)
    const uploadButton = document.getElementById('google-upload-button');
    if (uploadButton) {
        uploadButton.addEventListener('click', () => {
            if (capturedImagesQueue.length === 0) {
                alert("アップロードする写真がありません。");
                return;
            }
            if (window.isGoogleAuthed) {
                uploadAllImagesFromQueue();
            } else {
                // 認証を促すメッセージを表示し、認証フローを開始
                alert("Google Driveにアップロードするには、まず認証が必要です。このボタンを再度クリックして認証してください。");
                requestGoogleAuth();
            }
        });
    }

    // 撮り直しボタンのイベントリスナー (変更なし)
    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            if (capturedImagesQueue.length === 0) {
                alert("撮り直せる写真がありません。");
                // カメラ表示に戻す（既にカメラ表示なら何もしない）
                video.style.display = 'block';
                capturedImage.style.display = 'none';
                window.latestImageDataUrl = null;
                return;
            }
            // キューから最後の画像データを削除
            capturedImagesQueue.pop();
            console.log("Last captured image removed from queue.");
             // 最後の画像表示を消してカメラ表示に戻す
            const lastImageUrl = capturedImagesQueue.length > 0 ? capturedImagesQueue[capturedImagesQueue.length - 1] : null;
            if (lastImageUrl) {
                capturedImage.src = lastImageUrl;
                video.style.display = 'none';
                capturedImage.style.display = 'block';
            } else {
                video.style.display = 'block';
                capturedImage.style.display = 'none';
                window.latestImageDataUrl = null;
            }
            // バッジを更新
            updatePhotoCountBadge();
        });
    }

    // カメラ関連の初期化
    const video = document.getElementById('camera');
    const captureButton = document.getElementById('capture-button');
    const canvas = document.getElementById('canvas');
    const capturedImage = document.getElementById('captured-image');
    const context = canvas.getContext('2d');

    // カメラへのアクセス
    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment', // 背面カメラを使用
                    width: { ideal: 1920 }, // iPhone SEの解像度に合わせて調整可能
                    height: { ideal: 1080 }
                }, 
                audio: false 
            });
            video.srcObject = stream;
        } catch (err) {
            console.error("カメラへのアクセスに失敗しました: ", err);
            alert("カメラへのアクセス許可が必要です。");
        }
    }

    // ページ読み込み時にカメラを開始 → initializeCameraApp内での呼び出しに変更
    startCamera();

    // 撮影ボタンの処理
    captureButton.addEventListener('click', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageDataUrl = canvas.toDataURL('image/png');
        capturedImage.src = imageDataUrl;
        capturedImage.style.display = 'block';
        video.style.display = 'none';

        // ★ キューに画像データを追加
        capturedImagesQueue.push(imageDataUrl);
        window.latestImageDataUrl = imageDataUrl; // 表示や個別処理用に保持（不要なら削除可）
        console.log(`Image added to queue. Queue size: ${capturedImagesQueue.length}`);

        // バッジを更新
        updatePhotoCountBadge();
    });

    // 初期バッジ設定
    updatePhotoCountBadge();
}

// === ヘルパー関数 (スコープを移動) ===
// Data URIをBlobに変換するヘルパー関数
function dataURItoBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
}

// === Google Drive アップロード処理 ===
async function uploadImageToDrive(imageUrl) { // 引数名変更
    if (!gapiInited || !gisInited || !gapi.client.getToken()) {
        alert("Google Driveへのアップロードには、まずGoogle認証が必要です。");
        requestGoogleAuth(); // 認証を促す
        return;
    }

    if (!imageUrl) {
        alert("アップロードする画像データがありません。");
        return;
    }

    if (!googleDriveFolderId) { // ★ フォルダIDがあるかチェック
        alert("Google Driveのアップロード先フォルダIDが設定されていません。");
        return;
    }

    console.log(`Uploading image to Google Drive folder: ${googleDriveFolderId}...`);

    const blob = dataURItoBlob(imageUrl);
    const fileName = `receipt_${Date.now()}.png`;
    const metadata = {
        name: fileName,
        mimeType: 'image/png',
        parents: [googleDriveFolderId] // ★ 変数を使用
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob, fileName);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${gapi.client.getToken().access_token}` },
        body: form
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error("Google Drive API Error:", errorData);
        throw new Error(`Upload failed: ${errorData.error?.message || response.statusText}`);
    }

    const file = await response.json();
    console.log(`File uploaded successfully: ${fileName}`, file);
}

// ★ 一括アップロード関数
async function uploadAllImagesFromQueue() {
    if (capturedImagesQueue.length === 0) {
        alert("アップロードする写真がありません。");
        return;
    }

    const queueLength = capturedImagesQueue.length;
    alert(`${queueLength}枚の写真をアップロードします...`);

    let successCount = 0;
    let errorCount = 0;

    // アップロード処理（逐次実行）
    for (let i = 0; i < queueLength; i++) {
        const imageUrl = capturedImagesQueue[i];
        try {
            // ユーザーにどの画像をアップロード中か示す（オプション）
            // console.log(`Uploading image ${i + 1} of ${queueLength}...`);
            await uploadImageToDrive(imageUrl);
            successCount++;
        } catch (error) {
            console.error(`Failed to upload image ${i + 1}:`, error);
            errorCount++;
            // エラーが発生しても続行するか、ここで中断するか選択できます
            // とりあえず続行する実装
        }
    }

    // ★ アップロード完了後の処理
    alert(`アップロード完了！\n成功: ${successCount}枚\n失敗: ${errorCount}枚`);

    // グローバル変数をリセット
    capturedImagesQueue = []; // キューを空にする
    window.latestImageDataUrl = null;

    // UIをカメラ表示に戻す
    const video = document.getElementById('camera');
    const capturedImage = document.getElementById('captured-image');
    if (video) video.style.display = 'block';
    if (capturedImage) capturedImage.style.display = 'none';

    // ★★★ バッジ表示を更新（枚数を0にして非表示にする）★★★
    updatePhotoCountBadge(); 

    console.log("Upload queue cleared and UI reset.");
} 