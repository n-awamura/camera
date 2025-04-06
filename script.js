// アプリケーションのロジックをここに記述します
console.log("script.js loaded");

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

// ページ読み込み時にカメラを開始
startCamera();

// 撮影ボタンの処理
captureButton.addEventListener('click', () => {
    // videoのサイズに合わせてcanvasのサイズを設定
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // canvasに現在のフレームを描画
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // canvasの内容を画像として取得し、img要素に表示
    const imageDataUrl = canvas.toDataURL('image/png');
    capturedImage.src = imageDataUrl;
    capturedImage.style.display = 'block'; // 撮影後画像を表示
    video.style.display = 'none'; // 撮影後ビデオを非表示（任意）
    captureButton.style.display = 'none'; // 撮影後ボタンを非表示（任意）

    // ここでローカル保存とGoogle Driveへのアップロード処理を呼び出す
    // saveImageLocally(imageDataUrl);
    // uploadToGoogleDrive(imageDataUrl);
}); 