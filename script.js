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
let googleDriveFolderId = null;
let isPreviewMode = false;

// === DOM要素取得 ===
let video, captureButton, previewUploadButton,
    canvas, context, capturedImage, uploadPreviewContainer, uploadProgressText,
    shutterSound; // ★ シャッター音用の変数を追加

// --- シャッター音の安定再生ヘルパー ---
// Web Audio + オーディオ要素プールの二重系で再生を保証する
let shutterAudioContext = null;
let shutterAudioBuffer = null;
let shutterAudioLoadingPromise = null;
let shutterPlayers = [];
let shutterPlayerIndex = 0;

function createAudioContextIfNeeded() {
    if (!shutterAudioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        shutterAudioContext = new AudioCtx({ latencyHint: 'interactive' });
    }
}

function warmUpShutterSound() {
    // 読み込み遅延を減らすため事前にロード (fallback 用 audio 要素)
    prepareShutterPlayers();
    // Web Audio バッファも先に読み込み開始
    void loadShutterBuffer();
}

async function loadShutterBuffer() {
    if (shutterAudioBuffer) return shutterAudioBuffer;
    if (!shutterAudioLoadingPromise) {
        shutterAudioLoadingPromise = fetch('shutter.mp3')
            .then(res => res.arrayBuffer())
            .then(arrayBuf => {
                createAudioContextIfNeeded();
                return shutterAudioContext.decodeAudioData(arrayBuf);
            })
            .then(decoded => {
                shutterAudioBuffer = decoded;
                return decoded;
            })
            .catch(err => {
                console.warn("シャッター音バッファの読み込みに失敗:", err);
                return null;
            });
    }
    return shutterAudioLoadingPromise;
}

function prepareShutterPlayers() {
    if (!shutterSound) return;
    if (shutterPlayers.length > 0) return; // 既に作成済み
    const base = shutterSound;
    base.preload = 'auto';
    base.load();
    shutterPlayers.push(base);
    for (let i = 0; i < 3; i++) {
        const clone = base.cloneNode(true);
        clone.preload = 'auto';
        clone.load();
        shutterPlayers.push(clone);
    }
}

function setupShutterAudioUnlock() {
    const unlock = async () => {
        try {
            createAudioContextIfNeeded();
            if (shutterAudioContext.state === 'suspended') {
                await shutterAudioContext.resume();
            }
            await loadShutterBuffer();
            prepareShutterPlayers();
        } catch (e) {
            console.warn("シャッター音のアンロックに失敗:", e);
        }
    };
    // 最初のユーザー操作でアンロック
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('mousedown', unlock, { once: true });
}

async function playViaWebAudio() {
    try {
        createAudioContextIfNeeded();
        if (shutterAudioContext.state === 'suspended') {
            await shutterAudioContext.resume();
        }
        const buffer = await loadShutterBuffer();
        if (!buffer) return false;
        const source = shutterAudioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(shutterAudioContext.destination);
        source.start(0);
        return true;
    } catch (error) {
        console.warn("Web Audioでのシャッター再生に失敗:", error);
        return false;
    }
}

function playViaAudioElement() {
    prepareShutterPlayers();
    if (shutterPlayers.length === 0) return false;
    shutterPlayerIndex = (shutterPlayerIndex + 1) % shutterPlayers.length;
    const player = shutterPlayers[shutterPlayerIndex];
    try {
        player.currentTime = 0;
    } catch (error) {
        console.warn("シャッター音のシークに失敗(fallback):", error);
    }
    const playPromise = player.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(error => {
            console.warn("シャッター音の再生に失敗しました(fallback):", error);
        });
    }
    return true;
}

async function playShutterSoundSafely() {
    // Web Audio を優先しつつ、120ms以内に開始できなければ即フォールバック
    const webAudioPromise = playViaWebAudio();
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('timeout'), 120));
    const result = await Promise.race([webAudioPromise, timeoutPromise]);
    if (result !== true) {
        playViaAudioElement();
    }
}

// === アプリケーション初期化 ===
function initializeCameraApp() {
    // --- 要素取得 ---
    video = document.getElementById('camera');
    captureButton = document.getElementById('capture-button');
    previewUploadButton = document.getElementById('preview-upload-button');
    canvas = document.getElementById('canvas');
    context = canvas.getContext('2d');
    capturedImage = document.getElementById('captured-image');
    uploadPreviewContainer = document.getElementById('upload-preview-container');
    shutterSound = document.getElementById('shutter-sound'); // ★ audio要素を取得
    warmUpShutterSound();
    setupShutterAudioUnlock();

    // --- イベントリスナー設定 ---
    if (captureButton) captureButton.addEventListener('click', handleCaptureClick);
    if (previewUploadButton) previewUploadButton.addEventListener('click', handlePreviewUploadClick);
    if (uploadPreviewContainer) {
        uploadPreviewContainer.addEventListener('click', handleDeletePreviewImageClick);
    }

    // --- 初期状態設定 ---
    console.log("Setting up camera and initial badge state...");
    startCamera();
    updatePhotoCountBadge();
    updatePreviewUploadButtonState('preview');
}

// Google Client IDとFolder IDをWorkerから取得する関数
async function fetchGoogleConfig() {
    try {
        const response = await fetch(`${WORKER_URL}/config`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const config = await response.json();
        googleClientId = config.clientId;
        googleDriveFolderId = config.folderId;
        console.log("Google Config fetched:", { clientId: googleClientId ? 'OK' : 'Not Found', folderId: googleDriveFolderId ? 'OK' : 'Not Found' });
        // Client ID取得後にGIS初期化
        initializeGis();
    } catch (error) {
        console.error("Error fetching Google config:", error);
        alert("Google設定の読み込みに失敗しました。");
    }
}

// === イベントハンドラ ===

// 撮影ボタン (音再生追加)
function handleCaptureClick() {
    if (isPreviewMode) {
        console.log("Exiting preview via capture button.");
        exitPreviewMode(false);
        return;
    }
    // 通常の撮影処理
    captureImageAndAddToQueue();

    // ★ シャッター音を再生 ★
    void playShutterSoundSafely();

    updatePhotoCountBadge();
    updatePreviewUploadButtonState('preview');
}

// 画像をキャプチャしてキューに追加する関数
function captureImageAndAddToQueue() {
    if (!video || video.paused || video.ended || !video.srcObject) {
        console.warn("カメラが準備できていないため撮影できません。");
        return;
    }

    // --- トリミング計算に必要な値を取得 ---
    const videoWidth = video.videoWidth;    // カメラ映像の実際の幅
    const videoHeight = video.videoHeight;   // カメラ映像の実際の高さ
    const displayWidth = video.offsetWidth;  // video要素の画面上の表示幅
    const displayHeight = video.offsetHeight; // video要素の画面上の表示高さ

    if (!videoWidth || !videoHeight || !displayWidth || !displayHeight) {
         console.error("ビデオのサイズ情報が取得できませんでした。");
         // 通常のキャプチャを試みる (フォールバック)
         canvas.width = videoWidth || displayWidth || 640; // デフォルト値
         canvas.height = videoHeight || displayHeight || 480;
         context.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
        // --- アスペクト比を計算 ---
        const nativeRatio = videoWidth / videoHeight;
        const displayRatio = displayWidth / displayHeight;

        let sx = 0, sy = 0, sw = videoWidth, sh = videoHeight;

        // --- プレビューに合わせて描画ソース領域を計算 (object-fit: cover; を想定) ---
        if (nativeRatio > displayRatio) {
            // カメラ映像の方が横長の場合 (左右がプレビューでトリミングされている)
            sw = videoHeight * displayRatio; // 描画する幅を計算
            sx = (videoWidth - sw) / 2;      // 描画開始のX座標を中央に
            console.log(`Trimming left/right: sx=${sx}, sw=${sw}`);
        } else if (nativeRatio < displayRatio) {
            // カメラ映像の方が縦長の場合 (上下がプレビューでトリミングされている)
            sh = videoWidth / displayRatio; // 描画する高さを計算
            sy = (videoHeight - sh) / 2;     // 描画開始のY座標を中央に
            console.log(`Trimming top/bottom: sy=${sy}, sh=${sh}`);
        }
        // アスペクト比が同じ場合はトリミング不要 (sx=0, sy=0, sw=videoWidth, sh=videoHeight)

        // --- Canvasのサイズを、描画する領域のサイズに設定 ---
        // これにより、キャプチャ画像はプレビューと同じアスペクト比で、かつ高解像度になる
        canvas.width = sw;
        canvas.height = sh;

        // --- 計算したソース領域 (sx, sy, sw, sh) をCanvas全体 (0, 0, canvas.width, canvas.height) に描画 ---
        context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    }

    // --- 画像データを取得してキューに追加 ---
    try {
        const imageDataUrl = canvas.toDataURL('image/png');
        capturedImagesQueue.push(imageDataUrl);
        console.log(`Image added to queue (cropped). Queue size: ${capturedImagesQueue.length}`);
    } catch (e) {
         console.error("Error generating Data URL:", e);
         alert("画像データの生成に失敗しました。");
    }
}

// ★ プレビュー表示/アップロード実行ボタンのハンドラ (テキスト設定削除)
function handlePreviewUploadClick() {
    if (!isPreviewMode) {
        // --- プレビュー表示処理 ---
        showPreview();
    } else {
        // --- アップロード実行処理 (プレビューモード中) ---
        console.log("Upload confirm button clicked.");
        // 認証状態を確認
        if (window.isGoogleAuthed) {
            console.log("Already authenticated. Starting upload.");
            updatePreviewUploadButtonState('uploading');
            uploadAllImagesFromQueue();
        } else {
            console.log("Authentication required. Requesting Google Auth.");
            requestGoogleAuth();
        }
    }
}

// ★ プレビュー表示関数 (削除ボタン生成追加)
function showPreview() {
    if (capturedImagesQueue.length === 0) {
        alert("プレビューする写真がありません。");
        return;
    }
    console.log("Entering preview mode.");
    isPreviewMode = true;

    // カメラ非表示、プレビュー表示
    if (video) video.style.display = 'none';
    if (capturedImage) capturedImage.style.display = 'none';
    if (uploadPreviewContainer) {
        // --- コンテナの中身をクリア (進捗テキスト含む) ---
        uploadPreviewContainer.innerHTML = '';

        // --- 進捗テキスト要素を生成 (非表示) ---
        uploadProgressText = document.createElement('div');
        uploadProgressText.id = 'upload-progress-text';
        uploadProgressText.style.display = 'none'; // 非表示
        uploadPreviewContainer.appendChild(uploadProgressText); // DOMには追加しておく

        // --- 画像と削除ボタンを追加 ---
        capturedImagesQueue.forEach((imageDataUrl, index) => {
            // ラッパーdivを作成
            const wrapper = document.createElement('div');
            wrapper.className = 'preview-image-wrapper';

            // 画像imgを作成
            const img = document.createElement('img');
            img.src = imageDataUrl;
            img.alt = `アップロード予定 ${index + 1}`;
            wrapper.appendChild(img); // ラッパーに追加

            // 削除ボタンbuttonを作成
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-preview-image';
            deleteBtn.setAttribute('aria-label', '画像を削除');
            // ★ クリック時に識別しやすいように画像URLをdata属性に持つ (indexより安全)
            deleteBtn.dataset.imageUrl = imageDataUrl;
            deleteBtn.innerHTML = '<i class="bi bi-x-circle-fill"></i>';
            wrapper.appendChild(deleteBtn); // ラッパーに追加

            uploadPreviewContainer.appendChild(wrapper); // コンテナにラッパーを追加
        });
        uploadPreviewContainer.style.display = 'grid';
    } else {
        console.error("Upload preview container not found!");
        isPreviewMode = false; // 失敗したらフラグ戻す
        return;
    }

    // 下部ボタンコンテナは表示されたまま
    // const buttonContainer = document.querySelector('.button-container');
    // if (buttonContainer) buttonContainer.style.display = 'none'; // ← この行を削除

    // ボタン状態を「アップロード確認」に変更
    updatePreviewUploadButtonState('upload_confirm');
    // 他のボタン（撮影、撮り直し）は有効のまま（撮り直しはキャンセルとして使う）
}

// ★★★ 画像削除ボタンクリック処理 ★★★
function handleDeletePreviewImageClick(event) {
    // クリックされた要素が削除ボタンかチェック
    const deleteButton = event.target.closest('.delete-preview-image');
    if (!deleteButton) {
        return; // 削除ボタン以外なら何もしない
    }

    console.log("Delete image button clicked.");
    const imageUrlToDelete = deleteButton.dataset.imageUrl;
    const wrapperToRemove = deleteButton.closest('.preview-image-wrapper');

    if (!imageUrlToDelete || !wrapperToRemove) {
        console.error("Could not find image URL or wrapper to remove.");
        return;
    }

    // キューから該当する画像URLを削除
    const indexToDelete = capturedImagesQueue.indexOf(imageUrlToDelete);
    if (indexToDelete > -1) {
        capturedImagesQueue.splice(indexToDelete, 1);
        console.log(`Image removed from queue. New size: ${capturedImagesQueue.length}`);

        // DOMからラッパーごと削除
        wrapperToRemove.remove();

        // バッジ更新
        updatePhotoCountBadge();

        // もしキューが空になったらプレビューを終了
        if (capturedImagesQueue.length === 0) {
            console.log("Queue is empty after deletion, exiting preview.");
            exitPreviewMode(false); // キューは既に空
        } else {
            // プレビュー継続中の場合、アップロード確認ボタンの状態を維持
            updatePreviewUploadButtonState('upload_confirm');
        }
    } else {
        console.warn("Image URL not found in queue:", imageUrlToDelete);
    }
}

// ★ トークン取得後の処理 (ボタン状態更新追加)
function handleTokenResponse(response) {
    if (response.error) {
        if (response.error === 'interaction_required' || response.error === 'user_logged_out' || response.error === 'user_cancel' || response.error === 'access_denied') {
            console.warn('Google OAuth Interaction Required/User Cancelled/Denied:', response.error);
            // 必要ならユーザーに通知
            if (response.error === 'access_denied') {
                 alert('Google Driveへのアクセスが拒否されました。アップロード機能を利用するには許可が必要です。');
            }
        } else {
            console.error('Google OAuth Error:', response.error);
            alert('Google認証中に予期せぬエラーが発生しました。');
        }
        if (window.gapi && gapi.client) {
             gapi.client.setToken(null); // トークンをクリア
        }
        updateAuthStatus(false);
        if (isPreviewMode) {
             console.log("Auth failed in preview mode, exiting preview.");
             alert("Google認証に失敗しました。カメラ画面に戻ります。");
             exitPreviewMode(false); // ★ キューはクリアしない
        }
        return;
    }

    console.log('Google Access Token acquired.');
    if (window.gapi && gapi.client) {
        gapi.client.setToken({ access_token: response.access_token });
    } else {
        console.error('GAPI client not initialized before setting token.');
    }

    updateAuthStatus(true);

    if (isPreviewMode) {
        console.log("Auth completed in preview mode. Starting upload.");
        updatePreviewUploadButtonState('uploading'); // ★ アップロード中表示に
        uploadAllImagesFromQueue();
    } else {
        console.log("Auth completed outside preview mode. Restarting camera.");
        if (capturedImage) capturedImage.style.display = 'none';
        startCamera();
    }
}

// ★ 一括アップロード関数 (枠線表示削除)
async function uploadAllImagesFromQueue() {
    if (capturedImagesQueue.length === 0 ) {
        console.warn("Upload queue is empty.");
        exitPreviewMode(true);
        return;
    }
    const queueLength = capturedImagesQueue.length;
    console.log(`Starting upload of ${queueLength} images...`);

    updatePreviewUploadButtonState('uploading');

    let successCount = 0;
    let errorCount = 0;

    try {
        for (let i = 0; i < queueLength; i++) {
            const imageUrl = capturedImagesQueue[i];
            const imgElement = uploadPreviewContainer ? uploadPreviewContainer.querySelector(`img[data-index="${i}"]`) : null;
            console.log(`Loop ${i}: Found imgElement?`, imgElement); // ★ 確認ログ追加

            if (imgElement) imgElement.style.opacity = '0.7'; // Optional pre-opacity

            try {
                await uploadImageToDrive(imageUrl);
                successCount++;
                if (imgElement) {
                    console.log(`Loop ${i}: Success - Setting opacity`); // ★ 確認ログ追加
                    imgElement.style.opacity = '0.5';
                }
            } catch (error) {
                errorCount++;
                console.error(`Failed to upload image ${i + 1}:`, error);
                if (imgElement) {
                     console.log(`Loop ${i}: Error - Setting opacity`); // ★ 確認ログ追加
                     imgElement.style.opacity = '0.5';
                }
            }
        }

        const finalMessage = `アップロード完了！ 成功: ${successCount}枚, 失敗: ${errorCount}枚`;
        alert(finalMessage); // アラートで結果通知

        setTimeout(() => {
            exitPreviewMode(true); // キューをクリアして終了
        }, 2000);

    } catch (uploadError) {
         console.error("An error occurred during the upload loop:", uploadError);
         alert("アップロード中にエラーが発生しました。");
         exitPreviewMode(false); // エラー時はキューをクリアしない
    }
}

// ★ プレビューモードを終了し、カメラに戻る関数 (引数追加)
function exitPreviewMode(clearQueue = false) { // デフォルトはクリアしない
    console.log(`Exiting preview mode. Clear queue: ${clearQueue}`);
    isPreviewMode = false;

    // プレビューコンテナ非表示
    if (uploadPreviewContainer) uploadPreviewContainer.style.display = 'none';
    // ★ 念のため、プレビューコンテナ内の進捗テキストも非表示に
    if (uploadProgressText) uploadProgressText.style.display = 'none';

    if (clearQueue) {
        capturedImagesQueue = []; // キューをクリア
    }
    updatePhotoCountBadge(); // バッジ更新
    updatePreviewUploadButtonState('preview'); // ボタン状態を元に戻す

    // カメラを再開
    startCamera();
}

// ★ カメラへのアクセス
async function startCamera() {
    // video要素を関数内で取得 (グローバル変数を使う場合でも念のため)
    const currentVideo = document.getElementById('camera');
    if (!currentVideo) {
        console.error("Camera element not found in startCamera.");
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment', // 外側カメラ優先
                width: { ideal: 1920 }, // 解像度 (理想値)
                height: { ideal: 1080 }
            },
            audio: false
        });
        currentVideo.srcObject = stream;
        await currentVideo.play(); // 再生開始を待つ
        console.log("Camera stream started/restarted successfully.");
        // プレビュー中でなければ表示
        if (!isPreviewMode) {
            currentVideo.style.display = 'block';
        } else {
            currentVideo.style.display = 'none'; // プレビュー中は非表示
        }
    } catch (err) {
        console.error("カメラへのアクセスに失敗しました: ", err);
        alert("カメラへのアクセス許可が必要です。設定を確認してください。");
         // エラー時もプレビュー中でなければ表示を試みる（エラー内容によっては意味がないかも）
         if (currentVideo && !isPreviewMode) currentVideo.style.display = 'block';
    }
}

// Google認証を開始する関数 (consent prompt)
function requestGoogleAuth() {
    if (tokenClient) {
        console.log("Requesting Google consent...");
        // 既存のトークンがあれば破棄してからリクエストする (再認証を促すため)
        // google.accounts.oauth2.revoke(gapi.client.getToken().access_token, () => {
        //     console.log('Previous token revoked (if existed).');
        //     tokenClient.requestAccessToken({ prompt: 'consent' });
        // });
        // revokeは常に必要とは限らない。まずはpromptだけで試す
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        console.error("Cannot request Google Auth: tokenClient not initialized.");
        alert("Google認証の準備ができていません。ページを再読み込みしてください。");
    }
}

// 認証状態を更新するグローバル変数 (念のため window オブジェクトに)
window.isGoogleAuthed = false;
function updateAuthStatus(isAuthed) {
    console.log('Google Auth status updated:', isAuthed);
    window.isGoogleAuthed = isAuthed;
}

// ★ 枚数表示バッジ更新 (ボタン状態によらず表示、ただし枚数0なら非表示)
function updatePhotoCountBadge() {
    if (!previewUploadButton) { // 要素取得は initializeCameraApp で行う前提
        previewUploadButton = document.getElementById('preview-upload-button'); // 念のため再取得
         if (!previewUploadButton) return;
    }
    const badge = previewUploadButton.querySelector('#photo-count-badge');
    if (!badge) return;

    const count = capturedImagesQueue.length;
    badge.textContent = count;
    // プレビューモードかどうかに関わらず、枚数が0より大きい場合のみ表示
    badge.style.display = count > 0 ? 'inline-block' : 'none';
}

// ★ 初期化処理をまとめた関数
function performInitializations() {
    console.log("Starting initializations...");
    // Google API関連の初期化を開始
    fetchGoogleConfig(); // Client ID/Folder ID取得 -> GIS Init
    initializeGapiClient(); // GAPI Init
    // アプリケーション本体の初期化（カメラ表示など）
    initializeCameraApp(); // DOM要素取得、リスナー設定、カメラ開始、バッジ更新
}

// 認証状態の監視 (修正)
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("ログイン中のユーザー:", user.uid); // このログは表示されている

    // DOMの状態を確認
    if (document.readyState === 'loading') {
        // DOMがまだロード中なら、DOMContentLoadedを待つ
        console.log("DOM not ready yet, adding listener...");
        document.addEventListener('DOMContentLoaded', performInitializations);
    } else {
        // DOMが既にロード済みなら、すぐに初期化を実行
        console.log("DOM already ready, performing initializations immediately...");
        performInitializations();
    }
  } else {
    console.log("ユーザーはログインしていません。ログインページにリダイレクトします。");
    window.location.href = "login.html";
  }
});

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
                // apiKey: DRIVE_API_KEY, // APIキーは通常不要
                discoveryDocs: [DISCOVERY_DOC],
            });
            gapiInited = true;
            console.log('GAPI client initialized via gapi.load.');
            // GAPI初期化後にGISも初期化を試みる（順序依存の可能性）
            // initializeGis(); // fetchGoogleConfig内で呼ぶので不要かも
        } catch (error) {
            console.error("Error initializing GAPI client via gapi.load:", error);
            alert("Google APIクライアントの初期化に失敗しました。");
        }
    });
}

// GISクライアントの初期化
function initializeGis() {
    if (!googleClientId) {
        console.warn("Google Client ID not available yet for GIS initialization. Will retry...");
        setTimeout(initializeGis, 500); // Client ID取得後にリトライ
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
            callback: handleTokenResponse, // トークン取得時のコールバック
            error_callback: (error) => { // エラー時のコールバックを追加
                 console.error("GIS Initialization or Auth Error:", error);
                 // 'popup_closed_by_user' など特定のケースをハンドリングできる
                 if (error.type === 'popup_closed_by_user') {
                     console.log("Google Auth popup closed by user.");
                     // 認証失敗時の処理と同様の処理を行う
                     updateAuthStatus(false);
                     if (isPreviewMode) {
                         console.log("Auth cancelled in preview mode, exiting preview.");
                         alert("Google認証がキャンセルされました。");
                         exitPreviewMode();
                     }
                 } else {
                     alert(`Google認証の初期化または処理中にエラー (${error.type})`);
                     updateAuthStatus(false);
                     if (isPreviewMode) exitPreviewMode();
                 }
            }
        });
        gisInited = true;
        console.log('GIS token client initialized.');
    } catch (error) {
        console.error("Error initializing GIS token client:", error);
        alert("Google認証クライアントの初期化に失敗しました。");
    }
}

// === ヘルパー関数 (スコープを移動) ===
// Data URIをBlobに変換するヘルパー関数
function dataURItoBlob(dataURI) {
    try {
        const byteString = atob(dataURI.split(',')[1]);
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mimeString });
    } catch (e) {
         console.error("Error converting data URI to Blob:", e);
         // 不正なData URIの場合などにエラーになる可能性
         return null; // またはエラーを投げる
    }
}

// === Google Drive アップロード処理 ===
async function uploadImageToDrive(imageUrl) {
    // 認証状態をwindow変数で確認
    if (!window.isGoogleAuthed || !gapi.client.getToken()) {
        alert("Google Driveへのアップロードには、まずGoogle認証が必要です。");
        requestGoogleAuth(); // 認証を促す
        throw new Error("Authentication required."); // ★ Promiseをrejectするためにエラーを投げる
    }

    if (!imageUrl) {
        console.error("Upload error: imageUrl is missing.");
        throw new Error("画像データがありません。"); // ★ エラーを投げる
    }

    if (!googleDriveFolderId) {
        console.error("Upload error: Google Drive folder ID is not configured.");
        alert("Google Driveのアップロード先フォルダIDが設定されていません。");
        throw new Error("フォルダID未設定"); // ★ エラーを投げる
    }

    console.log(`Uploading image to Google Drive folder: ${googleDriveFolderId}...`);

    const blob = dataURItoBlob(imageUrl);
    if (!blob) { // dataURItoBlobがnullを返す場合
         throw new Error("画像データの変換に失敗しました。");
    }

    const fileName = `receipt_${Date.now()}.png`;
    const metadata = {
        name: fileName,
        mimeType: 'image/png',
        parents: [googleDriveFolderId]
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob, fileName);

    try {
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: `Bearer ${gapi.client.getToken().access_token}` },
            body: form
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Google Drive API Error:", errorData);
            // より詳細なエラーメッセージを試みる
            const message = errorData.error?.errors?.[0]?.message || errorData.error?.message || `HTTP ${response.status}`;
            throw new Error(`Upload failed: ${message}`);
        }

        const file = await response.json();
        console.log(`File uploaded successfully: ${fileName}`, file);
        // 成功時は値を返さない (void)
    } catch (networkError) {
        // fetch自体の失敗 (ネットワークエラーなど)
        console.error("Network error during upload:", networkError);
        throw new Error(`ネットワークエラー: ${networkError.message}`);
    }
}

// ★ ボタンの状態を更新するヘルパー関数 (アイコン変更)
function updatePreviewUploadButtonState(state) {
    if (!previewUploadButton) return;
    const icon = previewUploadButton.querySelector('i');
    const badge = previewUploadButton.querySelector('#photo-count-badge');

    switch (state) {
        case 'preview':
            previewUploadButton.disabled = false;
            if (icon) icon.className = 'bi bi-stack';
            if (badge) badge.style.display = capturedImagesQueue.length > 0 ? 'inline-block' : 'none';
            break;
        case 'upload_confirm': // プレビュー表示中
            previewUploadButton.disabled = false;
            // ★ アイコンをアップロードアイコンに戻す
            if (icon) icon.className = 'bi bi-cloud-upload-fill';
            if (badge) badge.style.display = 'inline-block';
            break;
        case 'uploading': // アップロード実行中
            previewUploadButton.disabled = true;
            if (icon) icon.className = 'bi bi-arrow-repeat spinner';
            if (badge) badge.style.display = 'inline-block';
            break;
        default:
            console.warn("Unknown button state:", state);
    }
}

// --- 以前の DOMContentLoaded リスナーは削除済みのはず --- 