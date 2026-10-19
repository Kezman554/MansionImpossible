import { Canvas } from '@react-three/fiber'
import { overlayTokens } from './scene/overlayTokens'
import './App.css'

function App() {
  return (
    <div className="app">
      <Canvas className="app__viewport" camera={{ position: [12, 9, 12], fov: 45 }}>
        <color attach="background" args={[overlayTokens.ground]} />
      </Canvas>
      <h1 className="app__title">Mansion Impossible</h1>
    </div>
  )
}

export default App
