import './App.css'
// import FaceDetection from './Face'
import { FaceApiCamera } from './FaceTensorFlow'

function App() {

  return (
    <div className='main'>
      {/* <FaceDetection/> */}
      <FaceApiCamera/>
    </div>
  )
}

export default App
