import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// 不加 StrictMode：设备模拟器持有 canvas/AudioContext 等硬件式资源，
// 开发模式下的双挂载会造成双份设备实例。
createRoot(document.getElementById('root')!).render(<App />)
