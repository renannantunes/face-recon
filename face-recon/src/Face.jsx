import { useEffect, useRef, useState } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import "./Face.scss";
import mask from "./assets/mascara-foto.png";

export default function FaceDetectorComponent() {
    const [faceDetector, setFaceDetector] = useState(null);
    const [webcamActive, setWebcamActive] = useState(false);
    const [videoDetections, setVideoDetections] = useState([]);
    const [message, setMessage] = useState("Ative a câmera...");


    const videoRef = useRef(null);
    const lastVideoTime = useRef(-1);
    const requestRef = useRef();
    const mediaStreamRef = useRef();
    const lastExecuted = useRef(0);

    // Inicializa o Face Detector
    useEffect(() => {
        const initialize = async () => {
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
            );

            const detector = await FaceDetector.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
                    delegate: "CPU"
                },
                runningMode: "VIDEO"
            });

            setFaceDetector(detector);
        };

        initialize();
    }, []);

    // Handlers para webcam
    const enableWebcam = async () => {
        if (!faceDetector) return;

        setWebcamActive(true);

        if (navigator.mediaDevices?.getUserMedia) {
            navigator.mediaDevices
                .getUserMedia({
                    video: {
                        width: 500,
                        height: 500,
                    }
                })
                .then((stream) => {
                    mediaStreamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.addEventListener('loadeddata', predictWebcam);
                    }
                });
        }
    };

    const predictWebcam = async () => {
        if (!videoRef.current || !faceDetector) return;

        if (videoRef.current.currentTime !== lastVideoTime.current) {
            lastVideoTime.current = videoRef.current.currentTime;
            const detections = faceDetector.detectForVideo(
                videoRef.current,
                performance.now()
            ).detections;

            setVideoDetections(detections);
        }

        requestRef.current = requestAnimationFrame(predictWebcam);


    };

    const detectCenter = (boundingBox, videoElement) => {
        const imageWidth = videoElement.videoWidth;
        const imageHeight = videoElement.videoHeight;

        const boundingBoxCenterX = boundingBox.originX + boundingBox.width / 2;
        const boundingBoxCenterY = boundingBox.originY + boundingBox.height / 2;

        const imageCenterX = imageWidth / 2;
        const imageCenterY = imageHeight / 2;

        const tolerance = Math.min(imageWidth, imageHeight) * 0.13; // Ajuste dinâmico para diferentes resoluções

        const isCenteredX = Math.abs(boundingBoxCenterX - imageCenterX) <= tolerance;
        const isCenteredY = Math.abs(boundingBoxCenterY - imageCenterY) <= tolerance;

        return isCenteredX && isCenteredY;
    };

    const getAverageBrightness = (videoElement) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        let totalBrightness = 0;
        let totalPixels = pixels.length / 4; // Cada pixel tem 4 valores (R, G, B, A)

        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];

            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            totalBrightness += brightness;
        }

        return totalBrightness / totalPixels;
    };

    const isFaceFrontal = (keypoints) => {
        if (keypoints.length < 4) return false; // Precisa de pelo menos 4 pontos

        // Ordena keypoints da esquerda para a direita
        const sortedByX = [...keypoints].sort((a, b) => a.x - b.x);

        // Pegamos os dois primeiros como possíveis pontos do lado esquerdo
        const leftSide = sortedByX.slice(0, 2);
        // Pegamos os dois últimos como possíveis pontos do lado direito
        const rightSide = sortedByX.slice(-2);

        // O olho deve estar acima da orelha no eixo Y
        const leftEye = leftSide.reduce((prev, curr) => (prev.y < curr.y ? prev : curr));
        const leftEar = leftSide.reduce((prev, curr) => (prev.y > curr.y ? prev : curr));

        const rightEye = rightSide.reduce((prev, curr) => (prev.y < curr.y ? prev : curr));
        const rightEar = rightSide.reduce((prev, curr) => (prev.y > curr.y ? prev : curr));

        // Calcula as distâncias
        const distLeft = Math.sqrt(Math.pow(leftEye.x - leftEar.x, 2) + Math.pow(leftEye.y - leftEar.y, 2));
        const distRight = Math.sqrt(Math.pow(rightEye.x - rightEar.x, 2) + Math.pow(rightEye.y - rightEar.y, 2));

        // Define um limite para a diferença aceitável
        const threshold = Math.min(distLeft, distRight) * 0.6;

        return Math.abs(distLeft - distRight) < threshold;
    };

    useEffect(() => {
        const currentTime = Date.now();
        const timeElapsed = currentTime - lastExecuted.current;

        if (webcamActive && timeElapsed >= 1000) {
            lastExecuted.current = currentTime;

            if (!videoDetections || videoDetections.length === 0) {
                setMessage("Nenhum rosto detectado.");
                return;
            }

            if (videoDetections.length > 1) {
                setMessage("A imagem só pode conter um rosto.");
                return;
            }

            const keypoints = videoDetections[0].keypoints;
            if (!isFaceFrontal(keypoints)) {
                setMessage("Vire seu rosto de frente para a câmera.");
                return;
            }

            const boundingBox = videoDetections[0].boundingBox;
            const videoElement = videoRef.current;

            if (!videoElement) return;

            const brightness = getAverageBrightness(videoElement);
            if (brightness <= 60) {
                setMessage("A imagem está muito escura. Aproxime-se de uma fonte de luz.");
                return;
            }

            const isFaceBigEnough = boundingBox.height > videoElement.videoHeight * 0.45
                && boundingBox.width > videoElement.videoWidth * 0.45;

            const isFaceSmallEnough = boundingBox.height < videoElement.videoHeight * 0.57
                && boundingBox.width < videoElement.videoWidth * 0.57;

            const isCentered = detectCenter(boundingBox, videoElement);

            if (!isFaceBigEnough) {
                setMessage("Chegue mais perto.");
                return;
            }
            if (!isFaceSmallEnough) {
                setMessage("Se afaste um pouco.");
                return;
            }
            if (!isCentered) {
                setMessage("Centralize seu rosto na imagem.");
                return;
            }

            const confidence = Math.round(parseFloat(videoDetections[0].categories[0].score) * 100);
            console.log(`Confiança ${confidence}%`);
            if (confidence < 90) {
                setMessage("O rosto precisa estar descoberto.");
                return;
            }

            setMessage("Imagem aceita.");
        }
    }, [videoDetections]);



    // Cleanup webcam
    useEffect(() => {
        return () => {
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, []);

    return (
        <div className='container'>
            <h2>Face Detector</h2>

            <div className='wrapper'>
                <p className="message">{message}</p>
                {!webcamActive && (
                    <button onClick={enableWebcam}>Enable Webcam</button>
                )}
                <div className="webcam-container" style={{ position: "relative" }}>
                    {videoRef.current?.readyState === 4 && <img className="mask" src={mask} alt="Posicione seu rosto no centro" />}
                    <video ref={videoRef} autoPlay playsInline className="webcam-video" />
                    <DetectionOverlay detections={videoDetections} videoRef={videoRef} />
                </div>
            </div>
        </div>
    );
}

// Componente para renderizar as detecções
const DetectionOverlay = ({ detections, videoRef }) => {
    if (!videoRef.current) return null;

    const videoElement = videoRef.current;
    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;
    const displayWidth = videoElement.offsetWidth;
    const displayHeight = videoElement.offsetHeight;

    // Ajuste da escala do vídeo
    const scaleX = displayWidth / videoWidth;
    const scaleY = displayHeight / videoHeight;

    return (
        <div className="detection-overlay">
            {detections.map((detection, i) => (
                <div key={i}>
                    {/* Renderizar bounding boxes */}
                    <div
                        className="highlighter"
                        style={{
                            left: (videoWidth - detection.boundingBox.originX - detection.boundingBox.width) * scaleX, // Inverte a posição horizontal
                            top: detection.boundingBox.originY * scaleY,
                            width: detection.boundingBox.width * scaleX,
                            height: detection.boundingBox.height * scaleY,
                        }}
                    >
                        {Math.round(parseFloat(detection.categories[0].score) * 100)}
                    </div>

                    {/* Renderizar pontos-chave */}
                    {detection.keypoints.map((kp, j) => (
                        <div
                            key={j}
                            className="key-point"
                            style={{
                                left: (videoWidth - kp.x * videoWidth) * scaleX, // Inverte a posição horizontal dos keypoints
                                top: kp.y * videoHeight * scaleY,
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
};