import { AppProviders } from "./app/providers";
import { AppRoutes } from "./app/routes";
import { useAppBootstrap } from "./app/use-app-bootstrap";
import { MotionLayer } from "./motion";

function App() {
  const { config, profile } = useAppBootstrap();

  return (
    <AppProviders config={config} profile={profile}>
      <MotionLayer />
      <AppRoutes />
    </AppProviders>
  )
}

export default App
