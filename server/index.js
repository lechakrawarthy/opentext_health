// Long-running server: serves the API + built UI and runs the background check engine.
import app from './app.js';
import { startEngine } from './engine.js';
import { PORT } from './runtime.js';

app.listen(PORT, () => {
  console.log(`Canopy API listening on http://localhost:${PORT}`);
  startEngine();
});
