import { useEffect, useRef, useState } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import "./Face.scss";

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
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
            );

            const detector = await FaceDetector.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
                    delegate: "GPU"
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
                .getUserMedia({ video: true })
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

    const detectCenter = (boundingBox, imageWidth, imageHeight) => {
        const boundingBoxCenterX = boundingBox.originX + boundingBox.width / 2;
        const boundingBoxCenterY = boundingBox.originY + boundingBox.height / 2;

        const imageCenterX = imageWidth / 2;
        const imageCenterY = imageHeight / 2;

        // Defina uma margem de erro tolerável para a posição central (por exemplo, 50 pixels)
        const tolerance = 50;

        // Verifique se o centro do bounding box está dentro da margem tolerável do centro da imagem
        const isCenteredX = Math.abs(boundingBoxCenterX - imageCenterX) <= tolerance;
        const isCenteredY = Math.abs(boundingBoxCenterY - imageCenterY) <= tolerance;

        return isCenteredX && isCenteredY;
    };

    useEffect(() => {
        const currentTime = Date.now();
        const timeElapsed = currentTime - lastExecuted.current;

        // Só executa se já tiver passado 1 segundo (1000ms)
        if (webcamActive && timeElapsed >= 1000) {
            lastExecuted.current = currentTime; // Atualiza o tempo da última execução

            if (!videoDetections || videoDetections.length === 0) {
                setMessage("Nenhum rosto detectado.");
                return;
            }

            if (videoDetections.length > 1) {
                setMessage("A imagem só pode conter um rosto.");
                return;
            }

            const isFaceBigEnough =
                videoDetections[0].boundingBox.height > 170 && videoDetections[0].boundingBox.width > 170;
            const isCentered = detectCenter(videoDetections[0].boundingBox, 640, 480)

            if (!isFaceBigEnough) {
                setMessage("Chegue mais perto.");
                // setIsFaceValid(false);
                return;
            }
            if (!isCentered) {
                setMessage("Centralize seu rosto na imagem.");
                // setIsFaceValid(false);
                return;
            }
            console.log(videoDetections[0]);

            const confidence = Math.round(parseFloat(videoDetections[0].categories[0].score) * 100);
            if (confidence <= 92) {
                setMessage("O rosto precisa estar descoberto e de frente para a câmera.");
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
        <div>
            <h1>Face Detector</h1>

            <div>
                <p className="message">{message}</p>
                {!webcamActive && (
                    <button onClick={enableWebcam}>Enable Webcam</button>
                )}
                <div className="webcam-container" style={{ position: "relative" }}>
                    <video ref={videoRef} autoPlay playsInline className="webcam-video" />
                    <DetectionOverlay detections={videoDetections} isVideo videoRef={videoRef} />
                </div>
            </div>
        </div>
    );
}

// Componente para visualização da webcam
const WebcamView = ({ videoRef, detections, isActive, onEnable, message, setMessage }) => {
    // const [isFaceValid, setIsFaceValid] = useState(false);

    if (!detections || detections.length === 0) {
        setMessage("Nenhum rosto detectado.");
        // setIsFaceValid(false);
        return;
    }

    if (detections.length > 1) {
        setMessage("A imagem só pode conter um rosto.");
        // setIsFaceValid(false);
        return;
    }

    const confidence = Math.round(parseFloat(detections[0].categories[0].score) * 100)
    if (confidence < 95) {
        setMessage("O rosto precisa estar descoberto e de frente para a câmera.");
        // setIsFaceValid(false);
        return;
    }

    setMessage("Imagem aceita.");
    // setIsFaceValid(true);
    return (
        <div>
            <h2>Webcam Detection</h2>
            {!isActive && (
                <button onClick={onEnable}>Enable Webcam</button>
            )}
            <p>{message}</p>
            <div className="webcam-container" style={{ position: "relative" }}>
                <video ref={videoRef} autoPlay playsInline className="webcam-video" />
                {/*<DetectionOverlay detections={detections} isVideo videoRef={videoRef} />*/}
            </div>
        </div>
    );
};

// Componente para renderizar as detecções
const DetectionOverlay = ({ detections, imgElement, isVideo, videoRef }) => {
    return (
        <div className="detection-overlay">
            {detections.map((detection, i) => (
                <div key={i}>
                    {/* Renderizar bounding boxes */}
                    <div
                        className="highlighter"
                        style={{
                            left: detection.boundingBox.originX,
                            top: detection.boundingBox.originY,
                            width: detection.boundingBox.width,
                            height: detection.boundingBox.height,
                        }}
                    >{Math.round(parseFloat(detection.categories[0].score) * 100)}</div>

                    {/* Renderizar pontos-chave */}
                    {detection.keypoints.map((kp, j) => (
                        <div
                            key={j}
                            className="key-point"
                            style={{
                                left: kp.x * (isVideo ? videoRef.current?.offsetWidth : imgElement?.naturalWidth),
                                top: kp.y * (isVideo ? videoRef.current?.offsetHeight : imgElement?.naturalHeight),
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
};