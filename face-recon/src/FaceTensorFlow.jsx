import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera, faSpinner } from '@fortawesome/free-solid-svg-icons';
import './style.scss'; // Certifique-se de ter o arquivo CSS

export const FaceApiCamera = () => {
  // Refs (sem tipagem <Type>)
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  // States
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [feedback, setFeedback] = useState('Carregando IA...');
  const [isFaceValid, setIsFaceValid] = useState(false);
  const [photoTaken, setPhotoTaken] = useState(null);

  // 1. Carregar Modelos
  useEffect(() => {
    const loadModels = async () => {
      try {
        // Certifique-se que os arquivos estão na pasta public/models
        const MODEL_URL = 'models'; 
        
        await Promise.all([
          // Carrega os modelos Tiny (leves para mobile)
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        ]);
        
        setModelsLoaded(true);
        startVideo();
      } catch (err) {
        console.error("Erro ao carregar modelos:", err);
        setFeedback("Erro ao carregar sistema de face.");
      }
    };
    loadModels();

    // Limpeza ao desmontar
    return () => {
      stopCameraAndDetection();
    };
    // eslint-disable-next-line
  }, []);

  // 2. Iniciar Vídeo
  const startVideo = () => {
    navigator.mediaDevices
      .getUserMedia({ 
        video: { 
            facingMode: 'user',
            width: { ideal: 640 }, 
            height: { ideal: 480 } 
        } 
      })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        }
      })
      .catch((err) => {
        console.error("Erro na câmera:", err);
        setFeedback("Permissão de câmera negada.");
      });
  };

  // 3. Função de Limpeza (Essencial para não travar iOS)
  const stopCameraAndDetection = useCallback(() => {
    // Para o loop
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Para o vídeo
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Limpa src do vídeo
    if (videoRef.current) {
        videoRef.current.srcObject = null;
    }

    // Limpa o desenho do canvas
    if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    }
  }, []);

  // 4. Loop de Detecção e Desenho
  const handleVideoPlay = () => {
    if (!videoRef.current || !canvasRef.current) return;

    // Ajusta o tamanho do canvas para bater com o tamanho real do vídeo na tela
    const displaySize = { 
        width: videoRef.current.offsetWidth, 
        height: videoRef.current.offsetHeight 
    };
    
    faceapi.matchDimensions(canvasRef.current, displaySize);

    // Loop a cada 100ms
    intervalRef.current = setInterval(async () => {
        // Proteção contra crash
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

        // Configuração leve (Tiny)
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

        // Detecta rosto + landmarks
        const detection = await faceapi
            .detectSingleFace(videoRef.current, options)
            .withFaceLandmarks(true); // true usa o modelo tiny landmarks

        // Limpa desenho anterior
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (detection) {
            // Redimensiona os pontos para o tamanho da tela
            const resizedDetections = faceapi.resizeResults(detection, displaySize);

            // DESENHA OS PONTOS (Landmarks)
            // Você pode alterar a cor/grossura editando faceapi.draw options se quiser
            faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections);
            
            // Opcional: Desenha o quadrado
            // faceapi.draw.drawDetections(canvasRef.current, resizedDetections);

            // Valida Posição
            const status = checkFacePosition(detection);
            
            if (status === "OK") {
                setFeedback("Rosto Detectado! Não se mova.");
                setIsFaceValid(true);
            } else {
                setFeedback(status);
                setIsFaceValid(false);
            }
        } else {
            setFeedback("Procurando rosto...");
            setIsFaceValid(false);
        }

    }, 100);
  };

  // Lógica de validação (Nariz vs Queixo)
  const checkFacePosition = (face) => {
    const landmarks = face.landmarks;
    const nose = landmarks.getNose()[3]; // Ponta do nariz
    const jaw = landmarks.getJawOutline();
    const jawLeft = jaw[0];
    const jawRight = jaw[16];

    const distToLeft = Math.abs(nose.x - jawLeft.x);
    const distToRight = Math.abs(nose.x - jawRight.x);

    // Evita divisão por zero
    if (distToRight === 0) return "Centralize o rosto";

    const ratio = distToLeft / distToRight;
    const { width } = face.detection.box;
    
    // Pega largura original do vídeo ou usa fallback
    const videoWidth = videoRef.current ? videoRef.current.videoWidth : 640;
    
    if (width < videoWidth * 0.20) return "Aproxime-se mais";
    if (ratio < 0.5 || ratio > 1.5) return "Centralize o rosto";
    
    return "OK";
  };

  const takePhoto = () => {
    if (!videoRef.current || !isFaceValid) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
        // Desenha o vídeo no canvas
        ctx.drawImage(videoRef.current, 0, 0);
        // Salva como JPEG 0.8 (Mais leve que PNG)
        const imageSrc = canvas.toDataURL('image/jpeg', 0.8);
        
        // 1. Para tudo antes de atualizar o estado
        stopCameraAndDetection();
        
        // 2. Atualiza estado
        setPhotoTaken(imageSrc);
    }
  };

  // Renderização final
  if (photoTaken) {
    return (
        <div className="photo-result">
            <img src={photoTaken} alt="Selfie" style={{width: '100%', borderRadius: '12px'}} />
            <button 
                onClick={() => window.location.reload()} 
                style={{marginTop: '20px', padding: '10px'}}
            >
                Tentar Novamente
            </button>
        </div>
    );
  }

  return (
    <div className="camera-container">
      <h3 style={{color: '#333', marginBottom: '10px'}}>{feedback}</h3>
      
      <div className="video-wrapper">
        {!modelsLoaded && (
             <div className="loading-overlay">
                 <FontAwesomeIcon icon={faSpinner} spin size="2x" /> 
                 <span style={{marginLeft: '10px'}}>Carregando IA...</span>
             </div>
        )}
        
        {/* VÍDEO */}
        <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline // Importante para iOS
            onPlay={handleVideoPlay}
        />
        
        {/* CANVAS DE DESENHO (Overlay) */}
        <canvas ref={canvasRef} />
      </div>

      <button 
        className={`capture-btn ${isFaceValid ? 'active' : ''}`} 
        onClick={takePhoto}
        disabled={!isFaceValid}
      >
        <FontAwesomeIcon icon={faCamera} />
      </button>
    </div>
  );
};